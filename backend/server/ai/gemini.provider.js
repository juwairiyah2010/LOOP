import { GoogleGenAI } from "@google/genai";
import { BaseAIProvider } from "./provider.interface.js";
import { GROUNDING_SYSTEM_PROMPT, buildOpportunityFactSheet, sanitizeAIResult } from "./guardrails.js";
import { MockAIProvider } from "./mock.provider.js";

/**
 * Gemini AI Provider for LOOP
 * 
 * Implements AI intelligence layer using Google Gemini API.
 * Uses structured prompts and anti-hallucination constraints to ensure
 * model operates strictly on trusted opportunity data.
 */
export class GeminiAIProvider extends BaseAIProvider {
  constructor(apiKey = process.env.GEMINI_API_KEY) {
    super();
    this.apiKey = apiKey;
    this.isPlaceholderKey = !apiKey || apiKey.length < 30;
    this.fallback = new MockAIProvider();

    if (!this.isPlaceholderKey) {
      try {
        this.client = new GoogleGenAI({ apiKey: this.apiKey });
      } catch (err) {
        console.warn("Failed to initialize GoogleGenAI client:", err.message);
        this.client = null;
      }
    } else {
      this.client = null;
    }
  }

  getName() {
    return "gemini";
  }

  isAvailable() {
    return !!this.client && !this.isPlaceholderKey;
  }

  async _callGeminiJson(contents, systemInstruction = GROUNDING_SYSTEM_PROMPT) {
    if (!this.isAvailable()) {
      throw new Error("Gemini provider is not available (missing or placeholder API key)");
    }

    const response = await this.client.models.generateContent({
      model: "gemini-2.0-flash",
      contents,
      config: {
        responseMimeType: "application/json",
        systemInstruction
      }
    });

    let text = response.text;
    if (!text) throw new Error("Empty response from Gemini API");
    text = text.replace(/^```(?:json)?\n?/i, "").replace(/\n?```\n?$/i, "").trim();
    return JSON.parse(text);
  }

  async analyzeResume(input = {}) {
    if (!this.isAvailable()) {
      return this.fallback.analyzeResume(input);
    }

    try {
      const prompt = `
        Analyze this resume document and return a structured JSON object with these keys:
        - "skills" (array of professional skills)
        - "interests" (array of fields or topics)
        - "programmingLanguages" (array of languages)
        - "frameworks" (array of frameworks)
        - "tools" (array of tools/platforms)
        - "technologies" (array of technologies)
        - "domains" (array of industry domains, e.g. AI, Web Development, Fintech)
        - "preferredRoles" (array of roles inferred from past experience)
        - "strengthsSummary" (2-3 sentences highlighting core candidate strengths)
        - "recommendedProfileUpdates" (object with suggested "field", "skills" array, and "interests" array)
        
        Extract ONLY what is present or strongly evidenced in the document. Do not invent credentials.
      `;

      let contents;
      if (input.base64Pdf) {
        contents = [
          {
            inlineData: {
              data: input.base64Pdf,
              mimeType: "application/pdf"
            }
          },
          prompt
        ];
      } else {
        contents = `RESUME TEXT:\n${input.text || ""}\n\n${prompt}`;
      }

      const result = await this._callGeminiJson(contents);
      return result;
    } catch (err) {
      console.warn("Gemini resume analysis failed, falling back to local provider:", err.message);
      return this.fallback.analyzeResume(input);
    }
  }

  async analyzeSkillGap(userProfile = {}, opportunity = {}) {
    if (!this.isAvailable()) {
      return this.fallback.analyzeSkillGap(userProfile, opportunity);
    }

    try {
      const factSheet = buildOpportunityFactSheet(opportunity);
      const userFactSheet = JSON.stringify({
        skills: userProfile.skills || [],
        interests: userProfile.interests || [],
        field: userProfile.field || "Unspecified"
      }, null, 2);

      const prompt = `
        You are analyzing the skill gap for a student against a verified opportunity.
        
        TRUSTED OPPORTUNITY DATA:
        ${factSheet}

        STUDENT PROFILE:
        ${userFactSheet}

        TASK:
        Compare student skills against the required and tagged skills of the opportunity.
        Return JSON with:
        - "opportunityId": "${opportunity.id || opportunity._id}"
        - "opportunityTitle": "${opportunity.title}"
        - "organization": "${opportunity.organization}"
        - "matchedSkills": array of strings
        - "missingSkills": array of strings (from actual requirements/tags only)
        - "gapSeverity": "NONE" | "LOW" | "MODERATE" | "HIGH"
        - "readinessScore": number between 0 and 100
        - "competitiveAdvantage": array of bonus student skills that add value
        - "learningRoadmap": array of objects [{ "step": number, "title": string, "description": string, "estimatedTime": string }]
        - "summary": 1-2 sentence overview
      `;

      const result = await this._callGeminiJson(prompt);
      return sanitizeAIResult(result, opportunity);
    } catch (err) {
      console.warn("Gemini skill-gap failed, falling back to local provider:", err.message);
      return this.fallback.analyzeSkillGap(userProfile, opportunity);
    }
  }

  async summarizeOpportunity(opportunity = {}) {
    if (!this.isAvailable()) {
      return this.fallback.summarizeOpportunity(opportunity);
    }

    try {
      const factSheet = buildOpportunityFactSheet(opportunity);
      const prompt = `
        Provide a concise, high-impact executive summary for this opportunity.
        USE ONLY VERIFIED FACTS IN THE DATA. NEVER INVENT DEADLINES, PRIZES, OR REQUIREMENTS.

        OPPORTUNITY DATA:
        ${factSheet}

        Return JSON with:
        - "opportunityId": "${opportunity.id || opportunity._id}"
        - "quickTake": 1 punchy sentence summarizing the core value of this listing
        - "whoItsFor": target student profile
        - "keyCommitment": summary of work mode, location, and timeline
        - "highlights": array of 3-4 bullet strings (factual highlights from description and tags)
        - "deadlineNote": factual statement about deadline (or rolling if null)
        - "verifiedFacts": {
            "organization": "${opportunity.organization}",
            "deadline": ${opportunity.deadline ? `"${opportunity.deadline}"` : "null"},
            "workMode": "${opportunity.work_mode || 'unspecified'}",
            "prizeOrStipend": ${opportunity.prize_amount ? `"${opportunity.prize_amount}"` : "null"},
            "applyUrl": ${opportunity.apply_url ? `"${opportunity.apply_url}"` : "null"}
          }
      `;

      const result = await this._callGeminiJson(prompt);
      return sanitizeAIResult(result, opportunity);
    } catch (err) {
      console.warn("Gemini summary failed, falling back to local provider:", err.message);
      return this.fallback.summarizeOpportunity(opportunity);
    }
  }

  async explainMatch(userProfile = {}, opportunity = {}, deterministicMatch = {}) {
    if (!this.isAvailable()) {
      return this.fallback.explainMatch(userProfile, opportunity, deterministicMatch);
    }

    try {
      const factSheet = buildOpportunityFactSheet(opportunity);
      const prompt = `
        Explain why this opportunity matches this student.
        Grounded strictly in the profile, stored opportunity, and deterministic match result.

        OPPORTUNITY DATA:
        ${factSheet}

        STUDENT PROFILE:
        ${JSON.stringify(userProfile, null, 2)}

        DETERMINISTIC EVALUATION:
        Match Score: ${deterministicMatch.finalMatchScore}%
        Matched Skills: ${JSON.stringify(deterministicMatch.matchedSkills || [])}
        Missing Skills: ${JSON.stringify(deterministicMatch.missingSkills || [])}
        Eligible: ${deterministicMatch.isEligible}

        Return JSON with:
        - "opportunityId": "${opportunity.id || opportunity._id}"
        - "matchPercentage": ${deterministicMatch.finalMatchScore}
        - "headline": string
        - "narrativeExplanation": 2-3 sentences explaining the score
        - "topAlignments": array of strings
        - "potentialHesitations": array of strings
        - "recommendedAction": string
      `;

      const result = await this._callGeminiJson(prompt);
      return sanitizeAIResult(result, opportunity, deterministicMatch);
    } catch (err) {
      console.warn("Gemini match explain failed, falling back to local provider:", err.message);
      return this.fallback.explainMatch(userProfile, opportunity, deterministicMatch);
    }
  }

  async explainEligibility(userProfile = {}, opportunity = {}, deterministicEligibility = {}) {
    if (!this.isAvailable()) {
      return this.fallback.explainEligibility(userProfile, opportunity, deterministicEligibility);
    }

    try {
      const factSheet = buildOpportunityFactSheet(opportunity);
      const prompt = `
        Explain the eligibility status in plain English for a student.
        NEVER INVENT REQUIREMENTS. Use only the deterministic checks provided.

        OPPORTUNITY:
        ${factSheet}

        DETERMINISTIC ELIGIBILITY RESULT:
        ${JSON.stringify(deterministicEligibility, null, 2)}

        Return JSON with:
        - "opportunityId": "${opportunity.id || opportunity._id}"
        - "status": "${deterministicEligibility.status || deterministicEligibility.eligible || 'PASS'}"
        - "headline": string
        - "plainEnglishExplanation": clear, encouraging explanation
        - "passedCriteria": array of strings
        - "blockedCriteria": array of strings (from blockers)
        - "nextSteps": array of actionable steps
      `;

      const result = await this._callGeminiJson(prompt);
      return sanitizeAIResult(result, opportunity, deterministicEligibility);
    } catch (err) {
      console.warn("Gemini eligibility explain failed, falling back to local provider:", err.message);
      return this.fallback.explainEligibility(userProfile, opportunity, deterministicEligibility);
    }
  }

  async compareOpportunities(opportunities = [], userProfile = {}) {
    if (!this.isAvailable()) {
      return this.fallback.compareOpportunities(opportunities, userProfile);
    }

    try {
      const oppsData = opportunities.map(o => buildOpportunityFactSheet(o)).join("\n---\n");
      const prompt = `
        Compare these ${opportunities.length} opportunities side-by-side.
        DO NOT INVENT DETAILS. Use only the provided records.

        OPPORTUNITIES:
        ${oppsData}

        STUDENT PROFILE:
        ${JSON.stringify(userProfile, null, 2)}

        Return JSON with:
        - "comparedCount": ${opportunities.length}
        - "opportunities": array of basic info [{ id, title, organization, category, work_mode, deadline, prize_amount }]
        - "comparisonMatrix": {
            "focusArea": object mapping title to category/focus,
            "timelineAndDeadline": object mapping title to formatted deadline or rolling,
            "skillRequirements": object mapping title to array of skills,
            "rewardOrStipend": object mapping title to prize or 'None listed',
            "workMode": object mapping title to work mode
          }
        - "verdict": 2-3 sentences synthesis
        - "tradeoffs": array of objects [{ "aspect": string, "notes": string }]
        - "bestFitFor": object mapping title to recommendation
      `;

      const result = await this._callGeminiJson(prompt);
      return result;
    } catch (err) {
      console.warn("Gemini compare failed, falling back to local provider:", err.message);
      return this.fallback.compareOpportunities(opportunities, userProfile);
    }
  }

  async parseNaturalLanguageSearch(query = "") {
    if (!this.isAvailable()) {
      return this.fallback.parseNaturalLanguageSearch(query);
    }

    try {
      const prompt = `
        Parse this student natural language opportunity search query into structured search filters.
        QUERY: "${query}"

        Return JSON with:
        - "query": "${query}"
        - "interpretedFilters": {
            "category": optional string (e.g. "internship", "scholarship", "hackathon", "fellowship", "competition"),
            "categories": optional array of category strings,
            "skills": optional array of skill keywords extracted from query (e.g. ["AI"] or ["Java"]),
            "work_mode": optional string ("remote", "hybrid", "onsite"),
            "workModes": optional array of strings,
            "location": optional location string (e.g. "Delhi" if "near Delhi"),
            "hasPrize": optional boolean,
            "maxDaysLeft": optional number (e.g. 7 if "closing this week", 14 if "soon", 30 if "this month"),
            "education": optional object { "yearOfStudy": number or string, "major": string },
            "checkUserEligibility": optional boolean (true if user asks for opportunities they are eligible for)
          }
        - "summary": 1 sentence summary of what the student is looking for
      `;

      const result = await this._callGeminiJson(prompt);
      const filters = result.interpretedFilters || result.interpretedIntent || {};
      return {
        query,
        interpretedFilters: filters,
        interpretedIntent: filters,
        summary: result.summary || `Interpreted search for "${query}"`,
        _provider: this.getName()
      };
    } catch (err) {
      console.warn("Gemini NL search failed, falling back to local provider:", err.message);
      return this.fallback.parseNaturalLanguageSearch(query);
    }
  }

  async generatePersonalizedDigest(userProfile = {}, topOpportunities = [], options = {}) {
    if (!this.isAvailable()) {
      return this.fallback.generatePersonalizedDigest(userProfile, topOpportunities, options);
    }

    try {
      const oppsData = topOpportunities.slice(0, 4).map(o => ({
        id: o.id || o._id,
        title: o.title,
        organization: o.organization,
        category: o.category,
        deadline: o.deadline || null,
        tags: o.tags || []
      }));

      const prompt = `
        Generate a personalized student opportunity digest based on these top matching opportunities.
        CRITICAL: Highlight ONLY these exact opportunities. Never invent deadlines or programs.

        STUDENT:
        Name: ${userProfile.name || "Student"}
        Skills: ${(userProfile.skills || []).join(", ")}
        Field: ${userProfile.field || "STEM"}

        VERIFIED TOP MATCHES:
        ${JSON.stringify(oppsData, null, 2)}

        Return JSON with:
        - "greeting": friendly opening line
        - "digestDate": current date string (YYYY-MM-DD)
        - "curatedOpportunities": array of [{
            "opportunityId": string,
            "title": string,
            "organization": string,
            "category": string,
            "deadline": string or null,
            "whySelected": 1 sentence personalized rationale,
            "recommendedAction": 1 short action sentence
          }]
        - "actionItemOfTheWeek": urgent or key action item based on nearest deadline
        - "skillToFocusOn": skill name that would most help this student
        - "motivationalNote": encouraging 1 sentence thought
      `;

      const result = await this._callGeminiJson(prompt);
      return result;
    } catch (err) {
      console.warn("Gemini digest failed, falling back to local provider:", err.message);
      return this.fallback.generatePersonalizedDigest(userProfile, topOpportunities, options);
    }
  }
}
