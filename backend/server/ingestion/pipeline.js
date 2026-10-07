import { getOpportunitiesCollection, formatOpportunity } from "../db.js";

export class IngestionPipeline {
  constructor(adapters = []) {
    this.adapters = adapters;
  }

  registerAdapter(adapter) {
    this.adapters.push(adapter);
  }

  async run(adapterName = null) {
    const report = {
      started_at: new Date().toISOString(),
      adapters_run: [],
      total_fetched: 0,
      total_valid: 0,
      total_inserted: 0,
      total_updated: 0,
      total_skipped: 0,
      errors: []
    };

    const targetAdapters = adapterName
      ? this.adapters.filter(a => a.name === adapterName)
      : this.adapters;

    if (targetAdapters.length === 0) {
      report.errors.push(`No adapters found matching name '${adapterName}'`);
      return report;
    }

    const coll = await getOpportunitiesCollection();

    for (const adapter of targetAdapters) {
      report.adapters_run.push(adapter.name);
      try {
        console.log(`[IngestionPipeline] Running adapter '${adapter.name}'...`);
        const rawItems = await adapter.fetch();
        report.total_fetched += rawItems.length;

        for (const raw of rawItems) {
          try {
            const opp = adapter.normalize(raw);
            const { isValid, errors } = adapter.validate(opp);

            if (!isValid) {
              report.total_skipped++;
              report.errors.push({ adapter: adapter.name, item: opp.title || "Unknown", errors });
              continue;
            }

            report.total_valid++;

            // Repeat-safe deduplication: match by source + source_id, id, content_hash, or title + org
            const existing = await coll.findOne({
              $or: [
                { source: opp.source, source_id: opp.source_id },
                { id: opp.id },
                { content_hash: opp.content_hash },
                { title: opp.title, organization: opp.organization }
              ]
            });

            const now = new Date().toISOString();

            if (existing) {
              const updates = {
                last_seen_at: now,
                last_verified_at: now,
                updated_at: now,
                deadline: opp.deadline || existing.deadline,
                apply_url: opp.apply_url || existing.apply_url,
                description: opp.description || existing.description,
                tags: Array.from(new Set([...(existing.tags || []), ...(opp.tags || [])]))
              };

              await coll.updateOne({ _id: existing._id }, { $set: updates });
              report.total_updated++;
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
              report.total_inserted++;
            }
          } catch (err) {
            report.total_skipped++;
            report.errors.push({ adapter: adapter.name, error: err.message });
          }
        }
      } catch (err) {
        report.errors.push({ adapter: adapter.name, fatal: err.message });
      }
    }

    report.finished_at = new Date().toISOString();
    return report;
  }
}
