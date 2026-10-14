import { aiService } from "../ai/index.js";
import { getOpportunitiesCollection, formatOpportunity } from "../db.js";
import { DeterministicEligibilityEngine } from "../eligibility/engine.js";
import { DeterministicMatchingEngine } from "../matching/engine.js";

/**
 * Converts structured interpreted filters into an executable MongoDB query.
 * 
 * @param {Object} filters - Interpreted filters from AI
 * @param {Object} [options] - Options (e.g. referenceDate)
 * @returns {Object} MongoDB filter object
 */
export function buildMongoFilterQuery(filters = {}, options = {}) {
  const now = options.referenceDate ? new Date(options.referenceDate) : new Date();
  const mongoQuery = { active: { $ne: false } };
  const andClauses = [];

  // 1. Category filter
  if (filters.category) {
    mongoQuery.category = { $regex: `^${filters.category}$`, $options: "i" };
  } else if (filters.categories && filters.categories.length > 0) {
    mongoQuery.category = { $in: filters.categories.map(c => new RegExp(`^${c}$`, "i")) };
  }

  // 2. Work mode filter (remote, hybrid, onsite)
  if (filters.work_mode) {
    mongoQuery.work_mode = { $regex: `^${filters.work_mode}$`, $options: "i" };
  } else if (filters.workModes && filters.workModes.length > 0) {
    mongoQuery.work_mode = { $in: filters.workModes.map(m => new RegExp(`^${m}$`, "i")) };
  }

  // 3. Location filter (e.g., Delhi, Bangalore, etc.)
  if (filters.location) {
    const escapedLoc = filters.location.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    mongoQuery.location = { $regex: escapedLoc, $options: "i" };
  }

  // 4. Deadline / Timeframe filter (e.g., "closing this week", "urgent")
  if (filters.maxDaysLeft !== undefined && filters.maxDaysLeft !== null) {
    const maxDays = Number(filters.maxDaysLeft);
    const targetDate = new Date(now.getTime() + maxDays * 24 * 60 * 60 * 1000);
    mongoQuery.deadline = {
      $gte: now.toISOString(),
      $lte: targetDate.toISOString()
    };
  }

  // 5. Skills filter (matches in tags, title, description, or required_skills)
  if (filters.skills && filters.skills.length > 0) {
    const skillClauses = filters.skills.map(skill => {
      const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return {
        $or: [
          { tags: { $regex: escaped, $options: "i" } },
          { "eligibility.required_skills": { $regex: escaped, $options: "i" } },
          { title: { $regex: escaped, $options: "i" } },
          { description: { $regex: escaped, $options: "i" } }
        ]
      };
    });

    if (skillClauses.length === 1) {
      andClauses.push(skillClauses[0]);
    } else {
      andClauses.push({ $or: skillClauses });
    }
  }

  // 6. Has Prize or Stipend
  if (filters.hasPrize) {
    mongoQuery.prize_amount = { $exists: true, $ne: null };
  }

  if (andClauses.length > 0) {
    mongoQuery.$and = andClauses;
  }

  return mongoQuery;
}

/**
 * Executes a natural language search for opportunities:
 * 1. AI converts request into structured filters (AI NEVER sees the whole database).
 * 2. Server searches MongoDB using the structured filters.
 * 3. Applies deterministic eligibility and matching constraints.
 * 4. Returns interpreted filters, mongoQuery, and results.
 * 
 * @param {string} query - Natural language query string
 * @param {Object} [user] - Authenticated user doc or null
 * @param {Object} [options] - Optional overrides (limit, referenceDate)
 * @returns {Promise<Object>} Search result report
 */
export async function searchOpportunitiesByNaturalLanguage(query, user = null, options = {}) {
  if (!query || typeof query !== "string" || !query.trim()) {
    throw new Error("Search query must be a non-empty string");
  }

  // Bound query to prevent DoS via massive input strings
  const cleanQuery = query.trim().slice(0, 500);
  const limit = Math.min(Math.max(1, Number(options.limit) || 20), 100);

  // STEP 1: AI converts user request into structured filters (uses 2-hour AI cache for repeated queries)
  // (NOTE: Database is NEVER sent to AI)
  const aiInterpretation = await aiService.parseNaturalLanguageSearch(
    cleanQuery,
    Boolean(options.bypassCache)
  );

  const interpretedFilters = aiInterpretation.interpretedFilters || aiInterpretation.interpretedIntent || {};
  const summary = aiInterpretation.summary || `Interpreted search for "${cleanQuery}"`;

  // STEP 2: Convert structured filters into MongoDB query
  const mongoQuery = buildMongoFilterQuery(interpretedFilters, options);

  // STEP 3: Search MongoDB directly using structured filters
  const oppsColl = await getOpportunitiesCollection();
  const rawDocs = await oppsColl.find(mongoQuery).toArray();
  let matchedOpps = rawDocs.map(formatOpportunity);

  // STEP 4: Handle eligibility constraints
  // A) "Scholarships I am eligible for" -> Check user eligibility
  if (interpretedFilters.checkUserEligibility && user) {
    matchedOpps = matchedOpps.filter(opp => {
      const elig = DeterministicEligibilityEngine.evaluate(user, opp);
      return elig.eligible === "PASS";
    });
  }

  // B) "for 3rd year CSE students" -> Enforce academic profile eligibility if specified
  const edu = interpretedFilters.education;
  if (edu && (edu.yearOfStudy || edu.major)) {
    const targetMajor = (edu.major || "").toLowerCase();
    const targetYear = edu.yearOfStudy ? String(edu.yearOfStudy) : null;

    matchedOpps = matchedOpps.filter(opp => {
      const reqs = opp.eligibility || {};
      const allowedDegrees = (reqs.allowed_degrees || reqs.degrees || []).map(d => String(d).toLowerCase());
      const allowedMajors = (reqs.allowed_majors || reqs.branches || reqs.majors || []).map(m => String(m).toLowerCase());

      // If opportunity specifies strict major restrictions
      if (targetMajor && allowedMajors.length > 0) {
        const majorMatch = allowedMajors.some(m => m.includes(targetMajor) || targetMajor.includes(m) || m === "all" || m === "any");
        if (!majorMatch) return false;
      }

      // If opportunity specifies graduation years or years of study
      if (targetYear && reqs.allowed_years && reqs.allowed_years.length > 0) {
        const yearMatch = reqs.allowed_years.map(String).includes(targetYear);
        if (!yearMatch) return false;
      }

      return true;
    });
  }

  // STEP 5: Score and rank results deterministically
  const evalUser = user || (edu ? {
    profile: {
      field: edu.major || "Engineering",
      branch: edu.major || "CSE",
      year_of_study: edu.yearOfStudy ? String(edu.yearOfStudy) : "3"
    }
  } : {});

  const scoredResults = matchedOpps.map(opp => {
    const matchEval = DeterministicMatchingEngine.evaluate(evalUser, opp, {
      behaviorPrefs: user?.behaviorPrefs || {}
    });
    return {
      ...opp,
      matchScore: matchEval.finalMatchScore,
      matchEvaluation: {
        score: matchEval.finalMatchScore,
        reasons: matchEval.reasons,
        eligibility: matchEval.eligibility?.status
      }
    };
  });

  // Sort by match score descending
  scoredResults.sort((a, b) => b.matchScore - a.matchScore);
  const results = scoredResults.slice(0, limit);

  return {
    query: cleanQuery,
    interpretedFilters,
    mongoQuery,
    totalCount: results.length,
    totalMatches: results.length,
    results,
    summary,
    _provider: aiInterpretation._provider || "loop_ai"
  };
}
