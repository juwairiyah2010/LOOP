import { DeterministicEligibilityEngine } from "../eligibility/engine.js";

/**
 * Deterministic Matching Engine for LOOP Opportunities
 *
 * Implements a multi-factor deterministic scoring model while enforcing
 * eligibility as a hard constraint.
 *
 * Factors scored:
 * 1. Skills (25%)
 * 2. Interests (15%)
 * 3. Category (15%)
 * 4. Location & Work Mode (15%)
 * 5. Experience (10%)
 * 6. Behavior & Interactions (10%)
 * 7. Urgency (8%)
 * 8. Recency (7%)
 *
 * Constraint:
 * - Eligibility is evaluated via DeterministicEligibilityEngine.
 * - If eligibility === "FAIL", final match score is 0 with blockers reported.
 */

export const MATCH_WEIGHTS = {
  skills: 0.25,
  interests: 0.15,
  category: 0.15,
  location: 0.15,
  experience: 0.10,
  behavior: 0.10,
  urgency: 0.05,
  recency: 0.05,
};

// Known category keywords that are not skills
const NON_SKILL_TOKENS = new Set([
  "internship", "scholarship", "hackathon", "fellowship", "competition",
  "remote", "onsite", "hybrid", "virtual", "summer", "winter", "fall", "spring",
  "undergraduate", "post-grad", "postgraduate", "phd", "masters", "team", "individual",
  "stipend", "prizes", "need-based", "first-gen"
]);

function normalizeString(val) {
  return String(val || "").toLowerCase().trim();
}

function toLowerArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) {
    return val.map(item => normalizeString(item)).filter(Boolean);
  }
  if (typeof val === "string") {
    return val.split(",").map(item => normalizeString(item)).filter(Boolean);
  }
  return [];
}

function extractIdString(item) {
  if (!item) return "";
  if (typeof item === "object") {
    return String(item.opportunityId || item.id || item._id || "");
  }
  return String(item);
}

export class DeterministicMatchingEngine {
  /**
   * Evaluates match between a user and an opportunity.
   *
   * @param {Object} user - User document or profile object
   * @param {Object} opportunity - Opportunity document
   * @param {Object} [options] - Optional overrides (weights, referenceDate)
   * @returns {Object} Evaluation report
   */
  static evaluate(user = {}, opportunity = {}, options = {}) {
    const profile = user.profile || user || {};
    const opp = opportunity || {};
    const now = options.referenceDate ? new Date(options.referenceDate) : new Date();

    const weights = { ...MATCH_WEIGHTS, ...(options.weights || {}) };

    // User interactions
    const savedIds = (user.saved || options.saved || []).map(extractIdString).filter(Boolean);
    const interestedIds = (user.interested || options.interested || []).map(extractIdString).filter(Boolean);
    const passedIds = (user.passed || options.passed || []).map(extractIdString).filter(Boolean);
    const appliedIds = (user.applied || options.applied || []).map(extractIdString).filter(Boolean);

    const oppId = String(opp.id || opp._id || "");

    const reasons = [];
    const matchedSkills = [];
    const missingSkills = [];
    const matchedInterests = [];

    // -------------------------------------------------------------
    // 0. ELIGIBILITY AS A HARD CONSTRAINT
    // -------------------------------------------------------------
    const eligibilityResult = DeterministicEligibilityEngine.evaluate(user, opp);
    const isEligible = eligibilityResult.eligible !== "FAIL";

    // -------------------------------------------------------------
    // 1. SKILLS SCORING (Weight: 25%)
    // -------------------------------------------------------------
    const userSkills = toLowerArray(profile.skills);
    const explicitRequiredSkills = toLowerArray(
      opp.eligibility?.required_skills || opp.eligibility?.skills
    );

    // If explicit skills defined, use them. Otherwise extract skill tags.
    const oppTags = toLowerArray(opp.tags);
    let targetSkills = explicitRequiredSkills.length > 0
      ? explicitRequiredSkills
      : oppTags.filter(t => !NON_SKILL_TOKENS.has(t) && !t.startsWith("$"));

    if (targetSkills.length === 0 && oppTags.length > 0) {
      targetSkills = [...oppTags];
    }

    let skillsScore = 75; // baseline when no skills specified
    if (targetSkills.length > 0) {
      targetSkills.forEach(reqSkill => {
        const found = userSkills.some(
          uSkill => uSkill === reqSkill || uSkill.includes(reqSkill) || reqSkill.includes(uSkill)
        );
        if (found) {
          matchedSkills.push(reqSkill);
        } else {
          missingSkills.push(reqSkill);
        }
      });

      const skillRatio = matchedSkills.length / targetSkills.length;
      skillsScore = Math.round(skillRatio * 100);

      if (matchedSkills.length === targetSkills.length) {
        reasons.push(`Skills (100%): All ${targetSkills.length} required skills matched (${matchedSkills.join(", ")}).`);
      } else if (matchedSkills.length > 0) {
        reasons.push(
          `Skills (${skillsScore}%): Matched ${matchedSkills.length} of ${targetSkills.length} skills (${matchedSkills.join(", ")}). Missing: ${missingSkills.join(", ")}.`
        );
      } else {
        reasons.push(`Skills (0%): Missing required skills (${missingSkills.join(", ")}).`);
      }
    } else {
      reasons.push("Skills (75%): No strict skill prerequisites listed; open to various backgrounds.");
    }

    // -------------------------------------------------------------
    // 2. INTERESTS SCORING (Weight: 15%)
    // -------------------------------------------------------------
    const userInterests = toLowerArray(profile.interests);
    const userField = normalizeString(profile.field);
    const userGoal = normalizeString(profile.goal);
    const userFutureYou = normalizeString(profile.future_you);

    const interestHaystack = [
      ...oppTags,
      normalizeString(opp.category),
      normalizeString(opp.title),
      normalizeString(opp.description)
    ].join(" ");

    const interestSources = [...userInterests];
    if (userField && !interestSources.includes(userField)) {
      interestSources.push(userField);
    }
    if (userGoal && !interestSources.includes(userGoal)) {
      interestSources.push(userGoal);
    }
    if (userFutureYou && !interestSources.includes(userFutureYou)) {
      interestSources.push(userFutureYou);
    }

    let interestsScore = 50;
    if (interestSources.length > 0) {
      interestSources.forEach(interest => {
        if (interestHaystack.includes(interest)) {
          matchedInterests.push(interest);
        }
      });

      if (matchedInterests.length > 0) {
        // High boost when one or more core interests or field align
        const matchRatio = matchedInterests.length / interestSources.length;
        interestsScore = Math.min(100, Math.round(matchRatio * 50 + 50));
        reasons.push(
          `Interests (${interestsScore}%): Strong topic alignment with ${matchedInterests.join(", ")}.`
        );
      } else {
        interestsScore = 25;
        reasons.push(
          `Interests (25%): No direct alignment found with your listed interests (${interestSources.join(", ")}).`
        );
      }
    } else {
      interestsScore = 60;
      reasons.push("Interests (60%): No interests specified in profile (evaluated at neutral baseline).");
    }

    // -------------------------------------------------------------
    // 3. CATEGORY SCORING (Weight: 15%)
    // -------------------------------------------------------------
    const userCategories = toLowerArray(profile.categories);
    const oppCategory = normalizeString(opp.category);
    let categoryScore = 80;

    if (userCategories.length > 0) {
      if (oppCategory && userCategories.includes(oppCategory)) {
        categoryScore = 100;
        reasons.push(`Category (100%): Matches your preferred category '${opp.category}'.`);
      } else {
        categoryScore = 30;
        reasons.push(
          `Category (30%): Opportunity is '${opp.category}', while your preferences focus on ${userCategories.join(", ")}.`
        );
      }
    } else {
      categoryScore = 85;
      reasons.push("Category (85%): No category filters set; exploring all opportunity types.");
    }

    // -------------------------------------------------------------
    // 4. LOCATION & WORK MODE SCORING (Weight: 15%)
    // -------------------------------------------------------------
    const workMode = normalizeString(opp.work_mode);
    const oppLocation = normalizeString(opp.location);
    const userCountry = normalizeString(profile.country || profile.location);
    const userPreferredLocs = toLowerArray(profile.preferred_locations);

    let locationScore = 75;
    const isRemote = workMode === "remote" ||
      oppLocation.includes("remote") ||
      oppLocation.includes("virtual") ||
      oppLocation.includes("worldwide");

    if (isRemote) {
      locationScore = 100;
      reasons.push("Location (100%): Remote work mode allows participation from anywhere.");
    } else if (userPreferredLocs.length > 0 || userCountry) {
      const allLocs = [userCountry, ...userPreferredLocs].filter(Boolean);
      const locMatch = allLocs.some(loc => oppLocation.includes(loc) || loc.includes(oppLocation));

      if (locMatch) {
        locationScore = 100;
        reasons.push(`Location (100%): Location '${opp.location}' matches your location preferences.`);
      } else if (workMode === "hybrid") {
        locationScore = 60;
        reasons.push(`Location (60%): Hybrid in '${opp.location}' — may require partial travel or relocation.`);
      } else {
        locationScore = 40;
        reasons.push(`Location (40%): Onsite in '${opp.location}' — outside your preferred locations.`);
      }
    } else {
      locationScore = 75;
      reasons.push(`Location (75%): '${opp.location || "Unspecified"}' — no specific user location restrictions.`);
    }

    // -------------------------------------------------------------
    // 5. EXPERIENCE SCORING (Weight: 10%)
    // -------------------------------------------------------------
    const userExpYears = parseFloat(profile.experience_years || profile.experience || 0);
    const minExpYears = parseFloat(opp.eligibility?.min_experience || opp.eligibility?.min_experience_years || 0);

    let experienceScore = 90;
    if (!isNaN(minExpYears) && minExpYears > 0) {
      if (userExpYears >= minExpYears) {
        experienceScore = 100;
        reasons.push(`Experience (100%): Your experience (${userExpYears} yrs) satisfies requirement (${minExpYears} yrs).`);
      } else {
        const expRatio = minExpYears > 0 ? userExpYears / minExpYears : 1;
        experienceScore = Math.max(20, Math.round(expRatio * 60));
        reasons.push(`Experience (${experienceScore}%): Requires ${minExpYears} yrs, you have ${userExpYears} yrs.`);
      }
    } else {
      experienceScore = 95;
      reasons.push("Experience (95%): Entry-level / student friendly with no minimum years required.");
    }

    // -------------------------------------------------------------
    // 6. BEHAVIOR SCORING (Weight: 10%)
    // -------------------------------------------------------------
    let behaviorScore = 70;
    if (oppId && appliedIds.includes(oppId)) {
      behaviorScore = 100;
      reasons.push("Behavior (100%): You have already applied to this opportunity.");
    } else if (oppId && (savedIds.includes(oppId) || interestedIds.includes(oppId))) {
      behaviorScore = 95;
      reasons.push("Behavior (95%): Currently saved in your watchlist/interested list.");
    } else if (oppId && passedIds.includes(oppId)) {
      behaviorScore = 20;
      reasons.push("Behavior (20%): Previously passed/dismissed in your feed.");
    } else {
      // Affinity check: count interactions with matching category or tags
      const totalInteractions = savedIds.length + interestedIds.length;
      if (totalInteractions > 0) {
        behaviorScore = 80;
        reasons.push("Behavior (80%): Positive engagement pattern with relevant listings.");
      } else {
        behaviorScore = 70;
        reasons.push("Behavior (70%): Baseline engagement score (neutral history).");
      }
    }

    // -------------------------------------------------------------
    // 7. URGENCY SCORING (Weight: 8%)
    // -------------------------------------------------------------
    let urgencyScore = 70;
    if (opp.deadline) {
      const deadlineDate = new Date(opp.deadline);
      const diffMs = deadlineDate.getTime() - now.getTime();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays < 0) {
        urgencyScore = 0;
        reasons.push("Urgency (0%): Deadline has passed.");
      } else if (diffDays === 0) {
        urgencyScore = 100;
        reasons.push("Urgency (100%): Closes today! Immediate action required.");
      } else if (diffDays <= 3) {
        urgencyScore = 95;
        reasons.push(`Urgency (95%): High urgency — closes in ${diffDays} day(s).`);
      } else if (diffDays <= 7) {
        urgencyScore = 90;
        reasons.push(`Urgency (90%): Closes this week (${diffDays} days left).`);
      } else if (diffDays <= 21) {
        urgencyScore = 80;
        reasons.push(`Urgency (80%): Active application window (${diffDays} days left).`);
      } else if (diffDays <= 60) {
        urgencyScore = 70;
        reasons.push(`Urgency (70%): Ample time to apply (${diffDays} days left).`);
      } else {
        urgencyScore = 55;
        reasons.push(`Urgency (55%): Distant deadline (${diffDays} days left).`);
      }
    } else {
      urgencyScore = 60;
      reasons.push("Urgency (60%): Rolling / unspecified deadline.");
    }

    // -------------------------------------------------------------
    // 8. RECENCY SCORING (Weight: 7%)
    // -------------------------------------------------------------
    let recencyScore = 70;
    const postedDateStr = opp.posted_at || opp.first_seen_at || opp.application_start_date;
    if (postedDateStr) {
      const postedDate = new Date(postedDateStr);
      const daysSincePosted = Math.max(0, Math.floor((now.getTime() - postedDate.getTime()) / (1000 * 60 * 60 * 24)));

      if (daysSincePosted <= 1) {
        recencyScore = 100;
        reasons.push("Recency (100%): Fresh listing posted within the last 24 hours.");
      } else if (daysSincePosted <= 3) {
        recencyScore = 95;
        reasons.push(`Recency (95%): Recently posted ${daysSincePosted} days ago.`);
      } else if (daysSincePosted <= 7) {
        recencyScore = 85;
        reasons.push(`Recency (85%): Posted this week (${daysSincePosted} days ago).`);
      } else if (daysSincePosted <= 14) {
        recencyScore = 75;
        reasons.push(`Recency (75%): Posted ${daysSincePosted} days ago.`);
      } else if (daysSincePosted <= 30) {
        recencyScore = 65;
        reasons.push(`Recency (65%): Posted ${daysSincePosted} days ago.`);
      } else {
        recencyScore = 55;
        reasons.push(`Recency (55%): Established listing (${daysSincePosted} days old).`);
      }
    } else {
      recencyScore = 60;
      reasons.push("Recency (60%): Standard listing recency.");
    }

    // -------------------------------------------------------------
    // LEGACY TAG OVERLAP (Keep current matching logic intact)
    // -------------------------------------------------------------
    const profileTokens = [
      ...userSkills,
      ...userInterests,
      ...userCategories,
      userField
    ].filter(Boolean);

    const legacyMatchedTags = oppTags.filter(t => profileTokens.includes(t));
    const legacyTagScore = oppTags.length > 0
      ? Math.round((legacyMatchedTags.length / oppTags.length) * 100)
      : 0;

    // -------------------------------------------------------------
    // RAW WEIGHTED SCORE COMPUTATION
    // -------------------------------------------------------------
    const rawScoreDecimal =
      skillsScore * weights.skills +
      interestsScore * weights.interests +
      categoryScore * weights.category +
      locationScore * weights.location +
      experienceScore * weights.experience +
      behaviorScore * weights.behavior +
      urgencyScore * weights.urgency +
      recencyScore * weights.recency;

    const rawScore = Math.min(100, Math.max(0, Math.round(rawScoreDecimal)));

    // -------------------------------------------------------------
    // APPLY ELIGIBILITY CONSTRAINT
    // -------------------------------------------------------------
    let finalMatchScore = rawScore;
    const topReasons = [];

    if (!isEligible) {
      // Hard constraint failure: opportunity is locked/zeroed
      finalMatchScore = 0;
      topReasons.push(
        `⛔ ELIGIBILITY CONSTRAINT FAILED: ${eligibilityResult.blockers.join("; ")}. Final match score set to 0.`
      );
    } else if (eligibilityResult.eligible === "UNKNOWN") {
      // Partial unknown profile fields: conditional eligibility with slight uncertainty dampening
      finalMatchScore = Math.round(rawScore * 0.95);
      topReasons.push(
        `⚠️ ELIGIBILITY CONDITIONAL: Missing verification details (${eligibilityResult.warnings.join("; ")}).`
      );
    } else {
      topReasons.push(
        `✅ ELIGIBILITY SATISFIED: All mandatory eligibility constraints passed (${Math.round(eligibilityResult.confidence * 100)}% confidence).`
      );
    }

    const allReasons = [...topReasons, ...reasons];

    // -------------------------------------------------------------
    // EXPLAINABILITY: "WHY THIS MATCHES" (Stored profile & opp data only)
    // -------------------------------------------------------------
    // 1. Skills summary
    let skillsSummary = "";
    if (targetSkills.length > 0) {
      if (matchedSkills.length === targetSkills.length) {
        skillsSummary = `All ${targetSkills.length} required skills matched (${matchedSkills.join(", ")})`;
      } else if (matchedSkills.length > 0) {
        skillsSummary = `Matched ${matchedSkills.length} of ${targetSkills.length} skills (${matchedSkills.join(", ")})`;
        if (missingSkills.length > 0) {
          skillsSummary += ` · Missing: ${missingSkills.join(", ")}`;
        }
      } else {
        skillsSummary = `Missing required skills (${missingSkills.join(", ")})`;
      }
    } else if (userSkills.length > 0) {
      skillsSummary = "No strict skill prerequisites listed · Open to your background";
    } else {
      skillsSummary = "No skills listed on profile · Open to all backgrounds";
    }

    // 2. Interests summary
    let interestsSummary = "";
    if (matchedInterests.length > 0) {
      interestsSummary = `Direct alignment with your focus on ${matchedInterests.join(", ")}`;
    } else if (interestSources.length > 0) {
      interestsSummary = `Exploratory topic outside your primary interests (${interestSources.slice(0, 3).join(", ")})`;
    } else {
      interestsSummary = "General match · No specific interests set in profile";
    }

    // 3. Eligibility summary
    let eligibilitySummary = "";
    if (!isEligible) {
      eligibilitySummary = `Ineligible: ${eligibilityResult.blockers.join("; ")}`;
    } else if (eligibilityResult.eligible === "UNKNOWN") {
      eligibilitySummary = `Conditional: Verification recommended (${eligibilityResult.warnings.join("; ") || "unverified attributes"})`;
    } else {
      const criteriaPassed = eligibilityResult.reasons?.length > 0
        ? eligibilityResult.reasons.slice(0, 2).join("; ")
        : "All criteria passed (degree, academic status, GPA)";
      eligibilitySummary = `Eligible: Satisfies all criteria (${criteriaPassed})`;
    }

    // 4. Location & Mode summary
    let locationSummary = "";
    if (isRemote) {
      locationSummary = `Remote: Available worldwide from anywhere`;
    } else if (userPreferredLocs.length > 0 || userCountry) {
      const allLocs = [userCountry, ...userPreferredLocs].filter(Boolean);
      const locMatch = allLocs.some(loc => oppLocation.includes(loc) || loc.includes(oppLocation));
      if (locMatch) {
        locationSummary = `Location match: Matches your preferred location (${opp.location})`;
      } else if (workMode === "hybrid") {
        locationSummary = `Hybrid in ${opp.location}: Partial on-site presence required`;
      } else {
        locationSummary = `Onsite in ${opp.location} (outside preferred locations: ${allLocs.join(", ")})`;
      }
    } else {
      locationSummary = `Location: ${opp.location || "Flexible / Unspecified"}`;
    }

    // 5. Deadline urgency summary
    let urgencySummary = "";
    let urgencyLevel = "Rolling";
    let diffDays = null;
    if (opp.deadline) {
      const deadlineDate = new Date(opp.deadline);
      const diffMs = deadlineDate.getTime() - now.getTime();
      diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      if (diffDays < 0) {
        urgencyLevel = "Closed";
        urgencySummary = `Deadline passed (${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? "" : "s"} ago)`;
      } else if (diffDays === 0) {
        urgencyLevel = "Closes today";
        urgencySummary = "Closes today! Immediate action required";
      } else if (diffDays <= 3) {
        urgencyLevel = "High urgency";
        urgencySummary = `Closes in ${diffDays} day${diffDays === 1 ? "" : "s"} (high urgency)`;
      } else if (diffDays <= 7) {
        urgencyLevel = "Closing this week";
        urgencySummary = `Closes this week (${diffDays} days left)`;
      } else if (diffDays <= 21) {
        urgencyLevel = "Active window";
        urgencySummary = `Active application window (${diffDays} days left)`;
      } else {
        urgencyLevel = "Open";
        urgencySummary = `Open with ample time (${diffDays} days left)`;
      }
    } else {
      urgencyLevel = "Rolling";
      urgencySummary = "Rolling deadline with no fixed cut-off";
    }

    // 6. Relevant behavior summary
    let behaviorType = "neutral";
    let behaviorLabel = "Profile match";
    let behaviorSummary = "";
    if (oppId && appliedIds.includes(oppId)) {
      behaviorType = "applied";
      behaviorLabel = "Already applied";
      behaviorSummary = "You already submitted an application to this listing";
    } else if (oppId && (savedIds.includes(oppId) || interestedIds.includes(oppId))) {
      behaviorType = "saved";
      behaviorLabel = "Saved watchlist";
      behaviorSummary = "Currently saved in your watchlist/interested list";
    } else if (oppId && passedIds.includes(oppId)) {
      behaviorType = "passed";
      behaviorLabel = "Previously passed";
      behaviorSummary = "Previously dismissed in your feed";
    } else {
      const totalInteractions = savedIds.length + interestedIds.length;
      if (totalInteractions > 0) {
        behaviorType = "engaged";
        behaviorLabel = "Active interest";
        behaviorSummary = `Recommended based on your activity across ${opp.category || "relevant"} opportunities`;
      } else {
        behaviorType = "neutral";
        behaviorLabel = "Profile recommendation";
        behaviorSummary = "First-time recommendation based on stored profile criteria (no prior interaction)";
      }
    }

    const whyThisMatches = {
      matchPercentage: finalMatchScore,
      matchedSkills,
      matchedInterests,
      missingSkills,
      skillsSummary,
      interestsSummary,
      eligibility: {
        status: eligibilityResult.eligible,
        isEligible,
        summary: eligibilitySummary,
        blockers: eligibilityResult.blockers || [],
        warnings: eligibilityResult.warnings || [],
        confidence: eligibilityResult.confidence
      },
      locationMode: {
        workMode: opp.work_mode || (isRemote ? "remote" : "onsite"),
        location: opp.location || "Unspecified",
        isRemote,
        summary: locationSummary
      },
      deadlineUrgency: {
        deadline: opp.deadline || null,
        daysLeft: diffDays,
        urgencyLevel,
        summary: urgencySummary
      },
      relevantBehavior: {
        type: behaviorType,
        label: behaviorLabel,
        summary: behaviorSummary
      },
      factors: [
        {
          id: "percentage",
          label: "Match percentage",
          value: `${finalMatchScore}%`,
          summary: finalMatchScore > 0 ? `${finalMatchScore}% deterministic match based on profile attributes` : "0% (constrained due to hard eligibility blocker)",
          status: finalMatchScore >= 75 ? "positive" : finalMatchScore >= 50 ? "neutral" : "negative"
        },
        {
          id: "skills",
          label: "Matched skills",
          value: matchedSkills.length > 0 ? matchedSkills.join(", ") : (targetSkills.length === 0 ? "Open to all" : "None"),
          summary: skillsSummary,
          status: matchedSkills.length > 0 ? "positive" : targetSkills.length === 0 ? "neutral" : "warning"
        },
        {
          id: "interests",
          label: "Matched interests",
          value: matchedInterests.length > 0 ? matchedInterests.join(", ") : "Exploratory",
          summary: interestsSummary,
          status: matchedInterests.length > 0 ? "positive" : "neutral"
        },
        {
          id: "eligibility",
          label: "Eligibility",
          value: eligibilityResult.eligible === "PASS" ? "Eligible" : eligibilityResult.eligible === "FAIL" ? "Ineligible" : "Conditional",
          summary: eligibilitySummary,
          status: eligibilityResult.eligible === "PASS" ? "positive" : eligibilityResult.eligible === "FAIL" ? "negative" : "warning"
        },
        {
          id: "location",
          label: "Location/mode",
          value: opp.work_mode ? `${opp.work_mode.toUpperCase()} · ${opp.location || "Anywhere"}` : (opp.location || "Flexible"),
          summary: locationSummary,
          status: isRemote || locationScore >= 80 ? "positive" : "neutral"
        },
        {
          id: "urgency",
          label: "Deadline urgency",
          value: urgencyLevel,
          summary: urgencySummary,
          status: diffDays !== null && diffDays <= 3 && diffDays >= 0 ? "urgent" : "neutral"
        },
        {
          id: "behavior",
          label: "Relevant behavior",
          value: behaviorLabel,
          summary: behaviorSummary,
          status: behaviorType === "saved" || behaviorType === "applied" ? "positive" : behaviorType === "passed" ? "negative" : "neutral"
        }
      ]
    };

    return {
      finalMatchScore,
      matchScore: finalMatchScore, // Alias for backward compatibility
      isEligible,
      eligibility: {
        status: eligibilityResult.eligible, // "PASS" | "FAIL" | "UNKNOWN"
        isEligible,
        confidence: eligibilityResult.confidence,
        blockers: eligibilityResult.blockers || [],
        warnings: eligibilityResult.warnings || [],
        reasons: eligibilityResult.reasons || [],
        checks: eligibilityResult.checks || {}
      },
      scoreBreakdown: {
        skills: {
          score: skillsScore,
          weight: weights.skills,
          contribution: parseFloat((skillsScore * weights.skills).toFixed(2)),
          matched: matchedSkills,
          missing: missingSkills
        },
        interests: {
          score: interestsScore,
          weight: weights.interests,
          contribution: parseFloat((interestsScore * weights.interests).toFixed(2)),
          matched: matchedInterests
        },
        category: {
          score: categoryScore,
          weight: weights.category,
          contribution: parseFloat((categoryScore * weights.category).toFixed(2))
        },
        location: {
          score: locationScore,
          weight: weights.location,
          contribution: parseFloat((locationScore * weights.location).toFixed(2))
        },
        experience: {
          score: experienceScore,
          weight: weights.experience,
          contribution: parseFloat((experienceScore * weights.experience).toFixed(2))
        },
        behavior: {
          score: behaviorScore,
          weight: weights.behavior,
          contribution: parseFloat((behaviorScore * weights.behavior).toFixed(2))
        },
        urgency: {
          score: urgencyScore,
          weight: weights.urgency,
          contribution: parseFloat((urgencyScore * weights.urgency).toFixed(2))
        },
        recency: {
          score: recencyScore,
          weight: weights.recency,
          contribution: parseFloat((recencyScore * weights.recency).toFixed(2))
        },
        rawScore,
        legacyTagScore
      },
      matchedSkills,
      matchedInterests,
      matchedSkillsAndInterests: [...new Set([...matchedSkills, ...matchedInterests])],
      missingSkills,
      reasons: allReasons,
      whyThisMatches
    };
  }
}
