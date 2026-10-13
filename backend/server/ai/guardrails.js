/**
 * AI Guardrails & Grounding Sanitizer for LOOP
 * 
 * Enforces the core invariant:
 * AI must NEVER invent:
 * - deadlines
 * - organizations
 * - application URLs
 * - prizes/stipends
 * - eligibility requirements
 * - opportunity facts
 */

export const GROUNDING_SYSTEM_PROMPT = `
You are LOOP AI, an intelligent student advisory and opportunity intelligence layer.
You operate STRICTLY ON TOP OF TRUSTED, STORED OPPORTUNITY DATA.

ABSOLUTE GROUNDING CONSTRAINTS (ZERO-TOLERANCE FOR HALLUCINATION):
1. DEADLINES: Never invent, guess, or modify deadlines. The stored deadline is the only source of truth. If missing, say "Rolling or unlisted".
2. ORGANIZATIONS: Never invent organization names. Use only the exact organization provided in the input.
3. APPLICATION URLS: Never generate or alter URLs.
4. PRIZES & STIPENDS: Never invent or exaggerate prizes, salaries, or stipends. If null, explicitly state that no prize or stipend is specified.
5. ELIGIBILITY: Never invent eligibility rules, GPA limits, or degree restrictions. Only reference the verified requirements provided in the context.
6. OPPORTUNITY FACTS: Do not invent company details, locations, or program features that are not in the provided opportunity record.
7. TONE: Concise, encouraging, analytical, and honest. Highlight genuine strengths and genuine gaps.
`;

/**
 * Builds a structured, verified fact sheet representation of an opportunity for LLM prompts.
 * @param {Object} opp 
 * @returns {string}
 */
export function buildOpportunityFactSheet(opp = {}) {
  const reqs = opp.eligibility || {};
  return JSON.stringify({
    id: opp.id || opp._id,
    title: opp.title,
    organization: opp.organization,
    category: opp.category,
    location: opp.location,
    work_mode: opp.work_mode || "unspecified",
    deadline: opp.deadline || null,
    prize_amount: opp.prize_amount || null,
    apply_url: opp.apply_url || null,
    tags: opp.tags || [],
    description: opp.description || "",
    eligibility_requirements: {
      required_skills: reqs.required_skills || reqs.skills || [],
      allowed_degrees: reqs.allowed_degrees || reqs.degrees || [],
      allowed_majors: reqs.allowed_majors || reqs.majors || reqs.branches || [],
      min_gpa: reqs.min_gpa ?? null,
      graduation_years: reqs.graduation_years || reqs.grad_year || []
    }
  }, null, 2);
}

/**
 * Post-processes any AI output to guarantee that critical ground truth facts
 * (deadline, organization, apply_url, prize_amount, eligibility status)
 * are never fabricated or corrupted by the model.
 * 
 * @param {Object} aiOutput - Raw or parsed AI output
 * @param {Object} [trustedOpp] - Stored opportunity data
 * @param {Object} [trustedDeterministic] - Output from DeterministicMatchingEngine / DeterministicEligibilityEngine
 * @returns {Object} Guaranteed-grounded output
 */
export function sanitizeAIResult(aiOutput = {}, trustedOpp = null, trustedDeterministic = null) {
  if (!aiOutput || typeof aiOutput !== "object") return aiOutput;
  const sanitized = { ...aiOutput };

  if (trustedOpp) {
    // 1. Enforce verified organization
    if (sanitized.organization !== undefined) {
      sanitized.organization = trustedOpp.organization;
    }
    if (sanitized.verifiedFacts?.organization !== undefined) {
      sanitized.verifiedFacts.organization = trustedOpp.organization;
    }

    // 2. Enforce verified deadline
    if (sanitized.deadline !== undefined) {
      sanitized.deadline = trustedOpp.deadline || null;
    }
    if (sanitized.verifiedFacts?.deadline !== undefined) {
      sanitized.verifiedFacts.deadline = trustedOpp.deadline || null;
    }

    // 3. Enforce verified apply_url
    if (sanitized.apply_url !== undefined) {
      sanitized.apply_url = trustedOpp.apply_url || null;
    }
    if (sanitized.verifiedFacts?.applyUrl !== undefined) {
      sanitized.verifiedFacts.applyUrl = trustedOpp.apply_url || null;
    }

    // 4. Enforce verified prize/stipend
    if (sanitized.prize_amount !== undefined) {
      sanitized.prize_amount = trustedOpp.prize_amount || null;
    }
    if (sanitized.verifiedFacts?.prizeOrStipend !== undefined) {
      sanitized.verifiedFacts.prizeOrStipend = trustedOpp.prize_amount || null;
    }

    // 5. Enforce verified work_mode
    if (sanitized.work_mode !== undefined) {
      sanitized.work_mode = trustedOpp.work_mode || "unspecified";
    }
    if (sanitized.verifiedFacts?.workMode !== undefined) {
      sanitized.verifiedFacts.workMode = trustedOpp.work_mode || "unspecified";
    }
  }

  // 6. Enforce deterministic eligibility status if provided
  if (trustedDeterministic) {
    const canonicalStatus = trustedDeterministic.status || trustedDeterministic.eligible;
    if (canonicalStatus && sanitized.status !== undefined) {
      sanitized.status = canonicalStatus;
    }
    if (trustedDeterministic.finalMatchScore !== undefined && sanitized.matchPercentage !== undefined) {
      sanitized.matchPercentage = trustedDeterministic.finalMatchScore;
    }
  }

  return sanitized;
}
