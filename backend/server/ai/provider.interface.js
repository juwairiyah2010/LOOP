/**
 * Base AI Provider Interface for LOOP
 * 
 * Defines the contract for all AI intelligence providers (Gemini, Local Mock, etc.).
 * Implementations must NEVER invent:
 * - deadlines
 * - organizations
 * - application URLs
 * - prizes/stipends
 * - eligibility requirements
 * - opportunity facts
 */

export class BaseAIProvider {
  /**
   * @returns {string} Provider identifier (e.g. "gemini", "local_mock")
   */
  getName() {
    throw new Error("getName() must be implemented");
  }

  /**
   * @returns {boolean} Whether this provider is ready and configured
   */
  isAvailable() {
    throw new Error("isAvailable() must be implemented");
  }

  /**
   * Analyzes resume from base64 PDF or raw text.
   * @param {Object} input - { base64Pdf?: string, text?: string }
   * @returns {Promise<Object>}
   */
  async analyzeResume(input) {
    throw new Error("analyzeResume() must be implemented");
  }

  /**
   * Analyzes skill gap between user profile and opportunity.
   * @param {Object} userProfile - User profile with skills and interests
   * @param {Object} opportunity - Stored opportunity data
   * @returns {Promise<Object>}
   */
  async analyzeSkillGap(userProfile, opportunity) {
    throw new Error("analyzeSkillGap() must be implemented");
  }

  /**
   * Produces a concise, high-impact executive summary grounded in stored opp data.
   * @param {Object} opportunity - Stored opportunity data
   * @returns {Promise<Object>}
   */
  async summarizeOpportunity(opportunity) {
    throw new Error("summarizeOpportunity() must be implemented");
  }

  /**
   * Explains why an opportunity matches a user, combining profile + deterministic scoring.
   * @param {Object} userProfile - User profile data
   * @param {Object} opportunity - Stored opportunity data
   * @param {Object} deterministicMatch - Match result from DeterministicMatchingEngine
   * @returns {Promise<Object>}
   */
  async explainMatch(userProfile, opportunity, deterministicMatch) {
    throw new Error("explainMatch() must be implemented");
  }

  /**
   * Explains eligibility status in plain English grounded in deterministic checks.
   * @param {Object} userProfile - User profile data
   * @param {Object} opportunity - Stored opportunity data
   * @param {Object} deterministicEligibility - Eligibility result from DeterministicEligibilityEngine
   * @returns {Promise<Object>}
   */
  async explainEligibility(userProfile, opportunity, deterministicEligibility) {
    throw new Error("explainEligibility() must be implemented");
  }

  /**
   * Compares 2 to 4 opportunities side-by-side using strictly verified data.
   * @param {Array<Object>} opportunities - Stored opportunities to compare
   * @param {Object} [userProfile] - Optional user profile for fit recommendations
   * @returns {Promise<Object>}
   */
  async compareOpportunities(opportunities, userProfile = {}) {
    throw new Error("compareOpportunities() must be implemented");
  }

  /**
   * Parses a natural-language search query into structured filters and semantic intent.
   * @param {string} query - Natural language search query
   * @returns {Promise<Object>}
   */
  async parseNaturalLanguageSearch(query) {
    throw new Error("parseNaturalLanguageSearch() must be implemented");
  }

  /**
   * Generates a personalized opportunity digest/briefing for the user.
   * @param {Object} userProfile - User profile data
   * @param {Array<Object>} topOpportunities - Filtered/ranked stored opportunities
   * @param {Object} [options] - Additional context (recent actions, deadlines)
   * @returns {Promise<Object>}
   */
  async generatePersonalizedDigest(userProfile, topOpportunities, options = {}) {
    throw new Error("generatePersonalizedDigest() must be implemented");
  }
}
