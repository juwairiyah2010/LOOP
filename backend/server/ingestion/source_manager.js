import { DevToHackathonsAdapter } from "./adapters/devto_hackathons.adapter.js";
import { RemotiveInternshipsAdapter } from "./adapters/remotive_internships.adapter.js";
import { ArbeitnowOpportunitiesAdapter } from "./adapters/arbeitnow_opportunities.adapter.js";
import { SampleSourceAdapter } from "./sample.adapter.js";
import { IngestionPipeline } from "./pipeline.js";
import { computeQualityScore } from "./quality.js";
import { 
  getSourcesCollection, 
  getSourceHealthLogsCollection, 
  getOpportunitiesCollection,
  formatOpportunity,
  toObjectId
} from "../db.js";

export const SOURCE_STATUS = {
  HEALTHY: "healthy",
  DEGRADED: "degraded",
  FAILING: "failing",
  IDLE: "idle",
  RUNNING: "running",
  DISABLED: "disabled"
};

export const DEFAULT_SOURCES = [
  {
    id: "devto_hackathons",
    name: "devto_hackathons",
    displayName: "Dev.to Hackathons & Competitions",
    description: "Global community-driven hackathons and coding competitions scraped via DEV API",
    category: "hackathon",
    sourceUrl: "https://dev.to",
    enabled: true,
    status: SOURCE_STATUS.IDLE,
    last_successful_run: null,
    last_failure: null,
    duration: 0,
    fetched: 0,
    added: 0,
    updated: 0,
    duplicates: 0,
    errors: {
      count: 0,
      recent: []
    },
    history: []
  },
  {
    id: "remotive_internships",
    name: "remotive_internships",
    displayName: "Remotive Remote Tech Internships",
    description: "Worldwide remote software engineering internships and junior developer roles",
    category: "internship",
    sourceUrl: "https://remotive.com",
    enabled: true,
    status: SOURCE_STATUS.IDLE,
    last_successful_run: null,
    last_failure: null,
    duration: 0,
    fetched: 0,
    added: 0,
    updated: 0,
    duplicates: 0,
    errors: {
      count: 0,
      recent: []
    },
    history: []
  },
  {
    id: "arbeitnow_opportunities",
    name: "arbeitnow_opportunities",
    displayName: "Arbeitnow European & Global Roles",
    description: "English-speaking tech internships, fellowships, and visa-friendly tech roles",
    category: "job",
    sourceUrl: "https://arbeitnow.com",
    enabled: true,
    status: SOURCE_STATUS.IDLE,
    last_successful_run: null,
    last_failure: null,
    duration: 0,
    fetched: 0,
    added: 0,
    updated: 0,
    duplicates: 0,
    errors: {
      count: 0,
      recent: []
    },
    history: []
  },
  {
    id: "sample_aggregator",
    name: "sample_aggregator",
    displayName: "LOOP Verified Aggregator Feed",
    description: "High-trust academic partner fellowships, scholarships, and verified hackathons",
    category: "fellowship",
    sourceUrl: "https://example.com/loop-verified",
    enabled: true,
    status: SOURCE_STATUS.IDLE,
    last_successful_run: null,
    last_failure: null,
    duration: 0,
    fetched: 0,
    added: 0,
    updated: 0,
    duplicates: 0,
    errors: {
      count: 0,
      recent: []
    },
    history: []
  }
];

export class SourceManager {
  /**
   * Builds an adapter instance by source name/id.
   */
  static createAdapter(sourceId) {
    switch (sourceId) {
      case "devto_hackathons":
        return new DevToHackathonsAdapter();
      case "remotive_internships":
        return new RemotiveInternshipsAdapter();
      case "arbeitnow_opportunities":
        return new ArbeitnowOpportunitiesAdapter();
      case "sample_aggregator":
        return new SampleSourceAdapter();
      default:
        return null;
    }
  }

  /**
   * Initializes source definitions in DB if not already present.
   */
  static async initSources() {
    const coll = await getSourcesCollection();
    const existing = await coll.find({}).toArray();
    const existingIds = new Set(existing.map(s => s.id || s.name));

    for (const def of DEFAULT_SOURCES) {
      if (!existingIds.has(def.id)) {
        await coll.insertOne({
          ...def,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      }
    }
  }

  /**
   * Retrieves all tracked sources with health metrics.
   */
  static async getSources() {
    await this.initSources();
    const coll = await getSourcesCollection();
    return await coll.find({}).toArray();
  }

  /**
   * Retrieves a single source by ID or name.
   */
  static async getSource(sourceId) {
    await this.initSources();
    const coll = await getSourcesCollection();
    return await coll.findOne({ $or: [{ id: sourceId }, { name: sourceId }] });
  }

  /**
   * Enables or disables a source.
   */
  static async toggleSource(sourceId, enabled) {
    await this.initSources();
    const coll = await getSourcesCollection();
    const source = await coll.findOne({ $or: [{ id: sourceId }, { name: sourceId }] });
    if (!source) {
      throw new Error(`Source '${sourceId}' not found`);
    }

    const isEnabled = Boolean(enabled);
    const newStatus = isEnabled 
      ? (source.status === SOURCE_STATUS.DISABLED ? SOURCE_STATUS.IDLE : source.status)
      : SOURCE_STATUS.DISABLED;

    await coll.updateOne(
      { _id: source._id },
      { 
        $set: { 
          enabled: isEnabled, 
          status: newStatus,
          updated_at: new Date().toISOString()
        } 
      }
    );

    return { ...source, enabled: isEnabled, status: newStatus };
  }

  /**
   * Triggers ingestion for one or all enabled sources.
   * Tracks: status, last_successful_run, last_failure, duration, fetched, added, updated, duplicates, errors.
   */
  static async triggerIngestion({ sourceId = null, triggeredBy = "admin", force = false } = {}) {
    await this.initSources();
    const sourcesColl = await getSourcesCollection();
    const logsColl = await getSourceHealthLogsCollection();

    const allSources = await sourcesColl.find({}).toArray();
    const sourceMap = new Map(allSources.map(s => [s.id || s.name, s]));

    // Determine target sources
    let targets = [];
    if (sourceId) {
      const single = sourceMap.get(sourceId);
      if (!single) {
        throw new Error(`Source '${sourceId}' not found`);
      }
      if (!single.enabled && !force) {
        throw new Error(`Source '${sourceId}' is disabled. Enable it first or force execution.`);
      }
      targets = [single];
    } else {
      // All enabled sources
      targets = allSources.filter(s => s.enabled);
    }

    if (targets.length === 0) {
      return {
        success: true,
        summary: { message: "No enabled sources to ingest", ranCount: 0 },
        results: {}
      };
    }

    // Set target sources status to "running"
    for (const s of targets) {
      await sourcesColl.updateOne(
        { _id: s._id },
        { $set: { status: SOURCE_STATUS.RUNNING, updated_at: new Date().toISOString() } }
      );
    }

    // Instantiate adapters
    const adapters = [];
    for (const s of targets) {
      const adapter = this.createAdapter(s.id || s.name);
      if (adapter) adapters.push(adapter);
    }

    const pipeline = new IngestionPipeline(adapters);
    const pipelineReport = await pipeline.run();

    const results = {};
    const nowIso = new Date().toISOString();

    for (const target of targets) {
      const targetId = target.id || target.name;
      const stats = pipelineReport.adapters[targetId] || {
        fetched: 0,
        added: 0,
        updated: 0,
        duplicate: 0,
        failed: 0,
        error: "Adapter produced no output",
        errors: [],
        duration_ms: 0
      };

      const hasFatalError = Boolean(stats.error);
      const errorCount = (stats.errors || []).length + (hasFatalError ? 1 : 0);

      let finalStatus = SOURCE_STATUS.HEALTHY;
      if (hasFatalError && stats.fetched === 0) {
        finalStatus = SOURCE_STATUS.FAILING;
      } else if (errorCount > 0) {
        finalStatus = SOURCE_STATUS.DEGRADED;
      } else if (stats.fetched === 0 && !hasFatalError) {
        finalStatus = SOURCE_STATUS.IDLE;
      }

      const lastSuccess = (finalStatus === SOURCE_STATUS.HEALTHY || stats.added > 0 || stats.updated > 0)
        ? nowIso
        : target.last_successful_run;

      const lastFailure = errorCount > 0
        ? {
            timestamp: nowIso,
            error: stats.error || (stats.errors[0]?.message) || "Ingestion errors reported",
            errorCount
          }
        : target.last_failure;

      const runHistoryEntry = {
        runId: `run_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        timestamp: nowIso,
        status: finalStatus,
        duration: stats.duration_ms || 0,
        fetched: stats.fetched,
        added: stats.added,
        updated: stats.updated,
        duplicates: stats.duplicate,
        errorCount,
        triggeredBy
      };

      const existingHistory = Array.isArray(target.history) ? target.history : [];
      const updatedHistory = [runHistoryEntry, ...existingHistory].slice(0, 20);

      const recentErrors = [
        ...(stats.errors || []),
        ...(hasFatalError ? [{ message: stats.error, timestamp: nowIso, stage: "fatal" }] : [])
      ].slice(0, 10);

      // Update source in DB
      await sourcesColl.updateOne(
        { _id: target._id },
        {
          $set: {
            status: finalStatus,
            last_successful_run: lastSuccess,
            last_failure: lastFailure,
            duration: stats.duration_ms || 0,
            fetched: stats.fetched,
            added: stats.added,
            updated: stats.updated,
            duplicates: stats.duplicate,
            errors: {
              count: errorCount,
              recent: recentErrors
            },
            history: updatedHistory,
            updated_at: nowIso
          }
        }
      );

      // Persist health log
      await logsColl.insertOne({
        sourceId: targetId,
        sourceName: target.displayName || targetId,
        timestamp: nowIso,
        status: finalStatus,
        duration: stats.duration_ms || 0,
        fetched: stats.fetched,
        added: stats.added,
        updated: stats.updated,
        duplicates: stats.duplicate,
        errors: recentErrors,
        errorCount,
        triggeredBy
      });

      results[targetId] = {
        status: finalStatus,
        duration: stats.duration_ms || 0,
        fetched: stats.fetched,
        added: stats.added,
        updated: stats.updated,
        duplicates: stats.duplicate,
        errors: recentErrors,
        errorCount
      };
    }

    return {
      success: true,
      summary: pipelineReport.summary,
      results,
      started_at: pipelineReport.started_at,
      finished_at: pipelineReport.finished_at
    };
  }

  /**
   * Retrieves inspection failure records across sources or for a specific source.
   */
  static async getFailures({ sourceId = null, limit = 50 } = {}) {
    const logsColl = await getSourceHealthLogsCollection();
    const sourcesColl = await getSourcesCollection();

    const query = { errorCount: { $gt: 0 } };
    if (sourceId) {
      query.sourceId = sourceId;
    }

    const logEntries = await logsColl.find(query).sort({ timestamp: -1 }).limit(limit).toArray();

    // Also pull recent errors directly from sources
    const allSources = await sourcesColl.find({}).toArray();
    const sourceErrors = [];

    for (const src of allSources) {
      if (sourceId && src.id !== sourceId && src.name !== sourceId) continue;
      if (src.errors && Array.isArray(src.errors.recent) && src.errors.recent.length > 0) {
        for (const err of src.errors.recent) {
          sourceErrors.push({
            sourceId: src.id || src.name,
            sourceName: src.displayName,
            timestamp: err.timestamp || src.last_failure?.timestamp || src.updated_at,
            message: err.message || src.last_failure?.error,
            stage: err.stage || "pipeline",
            itemTitle: err.itemTitle || null
          });
        }
      }
    }

    // Merge, deduplicate, and sort descending
    const combined = [...logEntries.flatMap(l => (l.errors || []).map(e => ({
      sourceId: l.sourceId,
      sourceName: l.sourceName,
      timestamp: e.timestamp || l.timestamp,
      message: e.message,
      stage: e.stage || "pipeline",
      itemTitle: e.itemTitle || null
    }))), ...sourceErrors];

    const uniqueMap = new Map();
    combined.forEach(item => {
      const key = `${item.sourceId}_${item.timestamp}_${item.message}`;
      if (!uniqueMap.has(key)) uniqueMap.set(key, item);
    });

    const list = Array.from(uniqueMap.values())
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);

    return {
      total: list.length,
      failures: list
    };
  }

  /**
   * Inspects unverified and AI-generated opportunities.
   */
  static async getUnverifiedOpportunities({ filter = "all", search = "", category = "", limit = 50, skip = 0 } = {}) {
    const oppsColl = await getOpportunitiesCollection();
    const allDocs = await oppsColl.find({}).toArray();

    // An opportunity is unverified if verified !== true
    // An opportunity is AI-generated if is_ai_generated === true or source === "ai_generated"
    let list = allDocs.filter(opp => {
      const isUnverified = opp.verified !== true;
      const isAiGen = opp.is_ai_generated === true || opp.source === "ai_generated";

      if (filter === "ai_generated") return isAiGen;
      if (filter === "unverified") return isUnverified && !isAiGen;
      return isUnverified || isAiGen;
    });

    if (category) {
      list = list.filter(o => (o.category || "").toLowerCase() === category.toLowerCase());
    }

    if (search) {
      const term = search.toLowerCase();
      list = list.filter(o => 
        (o.title || "").toLowerCase().includes(term) ||
        (o.organization || "").toLowerCase().includes(term) ||
        (o.description || "").toLowerCase().includes(term)
      );
    }

    const total = list.length;
    const paginated = list.slice(skip, skip + limit).map(opp => {
      const qualityScore = computeQualityScore(opp);
      return {
        ...opp,
        qualityScore,
        is_ai_generated: Boolean(opp.is_ai_generated || opp.source === "ai_generated"),
        verified: Boolean(opp.verified)
      };
    });

    const aiGeneratedCount = allDocs.filter(o => o.is_ai_generated === true || o.source === "ai_generated").length;
    const unverifiedCount = allDocs.filter(o => o.verified !== true).length;

    return {
      opportunities: paginated,
      total,
      aiGeneratedCount,
      unverifiedCount
    };
  }

  /**
   * Verifies an opportunity: sets verified = true and updates verification metadata.
   */
  static async verifyOpportunity(oppId, adminName = "admin") {
    const oppsColl = await getOpportunitiesCollection();
    const strId = String(oppId);

    const existing = await oppsColl.findOne({
      $or: [{ id: strId }, { _id: toObjectId(strId) }]
    });

    if (!existing) {
      throw new Error(`Opportunity '${oppId}' not found`);
    }

    const now = new Date().toISOString();
    const updatedFields = {
      verified: true,
      status: "active",
      active: true,
      is_active: true,
      last_verified_at: now,
      verified_by: adminName,
      verified_at: now,
      updated_at: now
    };

    await oppsColl.updateOne(
      { _id: existing._id },
      { $set: updatedFields }
    );

    return {
      success: true,
      opportunityId: existing.id || String(existing._id),
      verified: true,
      verified_at: now,
      verified_by: adminName
    };
  }

  /**
   * Rejects / deactivates an opportunity.
   */
  static async rejectOpportunity(oppId, reason = "Rejected by administrator", adminName = "admin") {
    const oppsColl = await getOpportunitiesCollection();
    const strId = String(oppId);

    const existing = await oppsColl.findOne({
      $or: [{ id: strId }, { _id: toObjectId(strId) }]
    });

    if (!existing) {
      throw new Error(`Opportunity '${oppId}' not found`);
    }

    const now = new Date().toISOString();
    const updatedFields = {
      active: false,
      is_active: false,
      status: "rejected",
      rejected_reason: reason,
      rejected_by: adminName,
      rejected_at: now,
      updated_at: now
    };

    await oppsColl.updateOne(
      { _id: existing._id },
      { $set: updatedFields }
    );

    return {
      success: true,
      opportunityId: existing.id || String(existing._id),
      active: false,
      status: "rejected"
    };
  }

  /**
   * Aggregates system-wide health and administration statistics.
   */
  static async getSystemStats() {
    await this.initSources();
    const sourcesColl = await getSourcesCollection();
    const oppsColl = await getOpportunitiesCollection();

    const [sources, opportunities] = await Promise.all([
      sourcesColl.find({}).toArray(),
      oppsColl.find({}).toArray()
    ]);

    const enabledSources = sources.filter(s => s.enabled);
    const healthySources = sources.filter(s => s.status === SOURCE_STATUS.HEALTHY);
    const degradedSources = sources.filter(s => s.status === SOURCE_STATUS.DEGRADED);
    const failingSources = sources.filter(s => s.status === SOURCE_STATUS.FAILING);
    const disabledSources = sources.filter(s => !s.enabled || s.status === SOURCE_STATUS.DISABLED);

    const verifiedOpps = opportunities.filter(o => o.verified === true);
    const unverifiedOpps = opportunities.filter(o => o.verified !== true);
    const aiGeneratedOpps = opportunities.filter(o => o.is_ai_generated === true || o.source === "ai_generated");

    const totalFetched = sources.reduce((sum, s) => sum + (s.fetched || 0), 0);
    const totalAdded = sources.reduce((sum, s) => sum + (s.added || 0), 0);
    const totalUpdated = sources.reduce((sum, s) => sum + (s.updated || 0), 0);
    const totalDuplicates = sources.reduce((sum, s) => sum + (s.duplicates || 0), 0);

    const latestRunTimestamp = sources
      .map(s => s.last_successful_run)
      .filter(Boolean)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] || null;

    return {
      sources: {
        total: sources.length,
        enabled: enabledSources.length,
        healthy: healthySources.length,
        degraded: degradedSources.length,
        failing: failingSources.length,
        disabled: disabledSources.length
      },
      opportunities: {
        total: opportunities.length,
        verified: verifiedOpps.length,
        unverified: unverifiedOpps.length,
        aiGenerated: aiGeneratedOpps.length
      },
      ingestionTotals: {
        fetched: totalFetched,
        added: totalAdded,
        updated: totalUpdated,
        duplicates: totalDuplicates
      },
      latestRunTimestamp
    };
  }
}
