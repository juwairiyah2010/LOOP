import { getOpportunitiesCollection, formatOpportunity } from "../db.js";
import { normalizeOpportunity } from "./normalizer.js";
import { Deduplicator } from "./deduplicator.js";

export class IngestionPipeline {
  constructor(adapters = []) {
    this.adapters = adapters;
  }

  registerAdapter(adapter) {
    this.adapters.push(adapter);
  }

  async run(adapterName = null) {
    const startedAt = new Date().toISOString();
    const adapterStats = {};

    const targetAdapters = adapterName
      ? this.adapters.filter(a => a.name === adapterName)
      : this.adapters;

    if (targetAdapters.length === 0) {
      return {
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        summary: { adapters_count: 0, total_fetched: 0, total_added: 0, total_updated: 0, total_duplicate: 0, total_failed: 0 },
        adapters: {},
        error: `No adapters found matching name '${adapterName}'`
      };
    }

    const coll = await getOpportunitiesCollection();

    let grandFetched = 0;
    let grandAdded = 0;
    let grandUpdated = 0;
    let grandDuplicate = 0;
    let grandFailed = 0;

    for (const adapter of targetAdapters) {
      const stats = {
        fetched: 0,
        added: 0,
        updated: 0,
        duplicate: 0,
        failed: 0,
        error: null
      };

      try {
        console.log(`[IngestionPipeline] Running adapter '${adapter.name}'...`);
        const rawItems = await adapter.fetch();
        stats.fetched = Array.isArray(rawItems) ? rawItems.length : 0;
        grandFetched += stats.fetched;

        for (const raw of rawItems) {
          try {
            // Step 1: Normalize
            const rawOpp = adapter.normalize(raw);
            const opp = normalizeOpportunity(rawOpp);

            // Step 2: Validate
            const { isValid, errors } = adapter.validate(opp);

            if (!isValid) {
              stats.failed++;
              grandFailed++;
              console.warn(`[IngestionPipeline] Validation failed for '${opp?.title}':`, errors);
              continue;
            }

            // Step 3: Multi-Tier Deduplicate
            const existingRes = await Deduplicator.findExisting(coll, opp);
            const now = new Date().toISOString();

            if (existingRes && existingRes.match) {
              const existing = existingRes.match;
              // Preserve existing URLs and references if incoming is missing
              const updates = {
                last_seen_at: now,
                last_verified_at: now,
                updated_at: now,
                deadline: opp.deadline || existing.deadline,
                apply_url: opp.apply_url || existing.apply_url,
                source_url: opp.source_url || existing.source_url,
                description: opp.description || existing.description,
                tags: Array.from(new Set([...(existing.tags || []), ...(opp.tags || [])]))
              };

              await coll.updateOne({ _id: existing._id }, { $set: updates });
              stats.updated++;
              grandUpdated++;
            } else {
              const newDoc = formatOpportunity({
                ...opp,
                first_seen_at: now,
                last_seen_at: now,
                last_verified_at: now,
                created_at: now,
                updated_at: now
              });

              await coll.insertOne(newDoc);
              stats.added++;
              grandAdded++;
            }
          } catch (err) {
            stats.failed++;
            grandFailed++;
            console.warn(`[IngestionPipeline] Failed item in '${adapter.name}':`, err.message);
          }
        }
      } catch (err) {
        stats.error = err.message;
        console.error(`[IngestionPipeline] Adapter '${adapter.name}' failed:`, err.message);
      }

      adapterStats[adapter.name] = stats;
    }

    const finishedAt = new Date().toISOString();

    return {
      started_at: startedAt,
      finished_at: finishedAt,
      summary: {
        adapters_count: targetAdapters.length,
        total_fetched: grandFetched,
        total_added: grandAdded,
        total_updated: grandUpdated,
        total_duplicate: grandDuplicate,
        total_failed: grandFailed
      },
      adapters: adapterStats
    };
  }
}
