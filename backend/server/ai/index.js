import { GeminiAIProvider } from "./gemini.provider.js";
import { MockAIProvider } from "./mock.provider.js";
import { globalAICache, AICache } from "./cache.js";
import { sanitizeAIResult } from "./guardrails.js";

/**
 * AI Intelligence Layer Orchestrator for LOOP
 * 
 * Sits directly on top of trusted opportunity data.
 * Features:
 * - Replaceable AI Provider architecture (Gemini, Local Mock, etc.)
 * - Intelligent in-memory caching layer
 * - Strict anti-hallucination guardrails and fact sanitization
 */
class AIService {
  constructor() {
    this.geminiProvider = new GeminiAIProvider();
    this.mockProvider = new MockAIProvider();
    this.activeProvider = null;
    this.cache = globalAICache;

    this._initProvider();
  }

  _initProvider() {
    const forced = (process.env.AI_PROVIDER || "").toLowerCase();
    if (forced === "gemini" && this.geminiProvider.isAvailable()) {
      this.activeProvider = this.geminiProvider;
    } else if (forced === "mock" || forced === "local") {
      this.activeProvider = this.mockProvider;
    } else if (this.geminiProvider.isAvailable()) {
      this.activeProvider = this.geminiProvider;
    } else {
      this.activeProvider = this.mockProvider;
    }
  }

  /**
   * Returns current active provider info
   */
  getProviderInfo() {
    return {
      activeProvider: this.activeProvider.getName(),
      isGeminiAvailable: this.geminiProvider.isAvailable(),
      cacheStats: this.cache.getStats()
    };
  }

  /**
   * Sets or overrides the active provider (e.g. for testing or hot-swapping)
   */
  setProvider(provider) {
    if (!provider || typeof provider.analyzeResume !== "function") {
      throw new Error("Invalid provider: must implement BaseAIProvider");
    }
    this.activeProvider = provider;
  }

  /**
   * Resume analysis with caching
   */
  async analyzeResume(input = {}, bypassCache = false) {
    const content = input.base64Pdf || input.text || "";
    const cacheKey = `resume:${AICache.hash(content)}`;

    if (!bypassCache) {
      const cached = this.cache.get(cacheKey);
      if (cached) return { ...cached, _cached: true, _provider: this.activeProvider.getName() };
    }

    const result = await this.activeProvider.analyzeResume(input);
    this.cache.set(cacheKey, result, 1000 * 60 * 60 * 24); // 24 hours
    return { ...result, _cached: false, _provider: this.activeProvider.getName() };
  }

  /**
   * Skill-gap analysis against trusted opportunity
   */
  async analyzeSkillGap(userProfile = {}, opportunity = {}, bypassCache = false) {
    const oppId = String(opportunity.id || opportunity._id || "");
    const profileHash = AICache.hash(userProfile.skills || []);
    const cacheKey = `skillgap:${oppId}:${profileHash}`;

    if (!bypassCache) {
      const cached = this.cache.get(cacheKey);
      if (cached) return { ...cached, _cached: true, _provider: this.activeProvider.getName() };
    }

    const raw = await this.activeProvider.analyzeSkillGap(userProfile, opportunity);
    const sanitized = sanitizeAIResult(raw, opportunity);
    this.cache.set(cacheKey, sanitized, 1000 * 60 * 60 * 4); // 4 hours
    return { ...sanitized, _cached: false, _provider: this.activeProvider.getName() };
  }

  /**
   * Grounded executive summary for an opportunity
   */
  async summarizeOpportunity(opportunity = {}, bypassCache = false) {
    const oppId = String(opportunity.id || opportunity._id || "");
    const cacheKey = `summary:${oppId}:${opportunity.updated_at || opportunity.title || ""}`;

    if (!bypassCache) {
      const cached = this.cache.get(cacheKey);
      if (cached) return { ...cached, _cached: true, _provider: this.activeProvider.getName() };
    }

    const raw = await this.activeProvider.summarizeOpportunity(opportunity);
    const sanitized = sanitizeAIResult(raw, opportunity);
    this.cache.set(cacheKey, sanitized, 1000 * 60 * 60 * 24); // 24 hours
    return { ...sanitized, _cached: false, _provider: this.activeProvider.getName() };
  }

  /**
   * Match explanation grounded in profile and deterministic evaluation
   */
  async explainMatch(userProfile = {}, opportunity = {}, deterministicMatch = {}, bypassCache = false) {
    const oppId = String(opportunity.id || opportunity._id || "");
    const profileHash = AICache.hash({ skills: userProfile.skills, interests: userProfile.interests });
    const score = deterministicMatch.finalMatchScore ?? 0;
    const cacheKey = `matchexplain:${oppId}:${profileHash}:${score}`;

    if (!bypassCache) {
      const cached = this.cache.get(cacheKey);
      if (cached) return { ...cached, _cached: true, _provider: this.activeProvider.getName() };
    }

    const raw = await this.activeProvider.explainMatch(userProfile, opportunity, deterministicMatch);
    const sanitized = sanitizeAIResult(raw, opportunity, deterministicMatch);
    this.cache.set(cacheKey, sanitized, 1000 * 60 * 60 * 4);
    return { ...sanitized, _cached: false, _provider: this.activeProvider.getName() };
  }

  /**
   * Plain-English eligibility explanation grounded in deterministic checks
   */
  async explainEligibility(userProfile = {}, opportunity = {}, deterministicEligibility = {}, bypassCache = false) {
    const oppId = String(opportunity.id || opportunity._id || "");
    const profileHash = AICache.hash(userProfile);
    const status = deterministicEligibility.status || deterministicEligibility.eligible || "UNKNOWN";
    const cacheKey = `eligexplain:${oppId}:${profileHash}:${status}`;

    if (!bypassCache) {
      const cached = this.cache.get(cacheKey);
      if (cached) return { ...cached, _cached: true, _provider: this.activeProvider.getName() };
    }

    const raw = await this.activeProvider.explainEligibility(userProfile, opportunity, deterministicEligibility);
    const sanitized = sanitizeAIResult(raw, opportunity, deterministicEligibility);
    this.cache.set(cacheKey, sanitized, 1000 * 60 * 60 * 4);
    return { ...sanitized, _cached: false, _provider: this.activeProvider.getName() };
  }

  /**
   * Opportunity comparison grounded strictly in verified data
   */
  async compareOpportunities(opportunities = [], userProfile = {}, bypassCache = false) {
    const sortedIds = opportunities.map(o => String(o.id || o._id || "")).sort().join("_");
    const cacheKey = `compare:${sortedIds}:${AICache.hash(userProfile.field || "")}`;

    if (!bypassCache) {
      const cached = this.cache.get(cacheKey);
      if (cached) return { ...cached, _cached: true, _provider: this.activeProvider.getName() };
    }

    const result = await this.activeProvider.compareOpportunities(opportunities, userProfile);
    this.cache.set(cacheKey, result, 1000 * 60 * 60 * 6); // 6 hours
    return { ...result, _cached: false, _provider: this.activeProvider.getName() };
  }

  /**
   * Natural-language query parsing
   */
  async parseNaturalLanguageSearch(query = "", bypassCache = false) {
    const cleanQuery = query.trim().toLowerCase();
    const cacheKey = `nlsearch:${AICache.hash(cleanQuery)}`;

    if (!bypassCache) {
      const cached = this.cache.get(cacheKey);
      if (cached) return { ...cached, _cached: true, _provider: this.activeProvider.getName() };
    }

    const result = await this.activeProvider.parseNaturalLanguageSearch(cleanQuery);
    this.cache.set(cacheKey, result, 1000 * 60 * 60 * 2); // 2 hours
    return { ...result, _cached: false, _provider: this.activeProvider.getName() };
  }

  /**
   * Personalized digest for user based on top matching opportunities
   */
  async generatePersonalizedDigest(userProfile = {}, topOpportunities = [], options = {}, bypassCache = false) {
    const userId = userProfile.id || userProfile._id || AICache.hash(userProfile.name || "user");
    const today = new Date().toISOString().split("T")[0];
    const topIds = (topOpportunities || []).slice(0, 4).map(o => String(o.id || o._id)).join("_");
    const cacheKey = `digest:${userId}:${today}:${topIds}`;

    if (!bypassCache) {
      const cached = this.cache.get(cacheKey);
      if (cached) return { ...cached, _cached: true, _provider: this.activeProvider.getName() };
    }

    const result = await this.activeProvider.generatePersonalizedDigest(userProfile, topOpportunities, options);
    this.cache.set(cacheKey, result, 1000 * 60 * 60 * 6); // 6 hours
    return { ...result, _cached: false, _provider: this.activeProvider.getName() };
  }
}

export const aiService = new AIService();
export { GeminiAIProvider, MockAIProvider, AICache, sanitizeAIResult };
