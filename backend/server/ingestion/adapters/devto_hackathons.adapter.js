import { BaseSourceAdapter } from "../base.adapter.js";
import crypto from "crypto";

export class DevToHackathonsAdapter extends BaseSourceAdapter {
  constructor() {
    super("devto_hackathons");
  }

  async fetchWithRetry(url, retries = 2) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const res = await fetch(url, {
          headers: { "User-Agent": "LOOP-Opportunity-Aggregator/1.0" },
          signal: AbortSignal.timeout(8000)
        });
        if (res.ok) {
          return await res.json();
        }
      } catch (err) {
        if (attempt === retries) throw err;
        await new Promise(r => setTimeout(r, 1000));
      }
    }
    return [];
  }

  async fetch() {
    const [hackathons, competitions] = await Promise.all([
      this.fetchWithRetry("https://dev.to/api/articles?tag=hackathon&per_page=20").catch(() => []),
      this.fetchWithRetry("https://dev.to/api/articles?tag=competition&per_page=15").catch(() => [])
    ]);

    const seenIds = new Set();
    const combined = [];
    [...hackathons, ...competitions].forEach(item => {
      if (item && item.id && !seenIds.has(item.id)) {
        seenIds.add(item.id);
        combined.push(item);
      }
    });

    return combined;
  }

  normalize(article) {
    const title = (article.title || "").trim();
    const organization = (article.organization?.name || article.user?.name || "Dev.to Community").trim();
    const sourceId = String(article.id);
    const canonicalId = "devto_" + crypto.createHash("md5").update(`devto_${sourceId}`).digest("hex").substring(0, 16);
    const now = new Date().toISOString();

    const isComp = Array.isArray(article.tag_list) && article.tag_list.includes("competition");
    const category = isComp ? "competition" : "hackathon";

    const publishedAt = article.published_at ? new Date(article.published_at) : new Date();
    // Default deadline 30 days after publication if not specified
    const deadline = new Date(publishedAt.getTime() + 30 * 24 * 3600 * 1000).toISOString();

    const applyUrl = article.canonical_url || article.url || "https://dev.to";

    return {
      id: canonicalId,
      source: this.name,
      source_id: sourceId,
      source_url: applyUrl,
      apply_url: applyUrl,
      title,
      organization,
      category,
      description: article.description || article.title || "",
      location: "Remote / Global",
      work_mode: "remote",
      tags: Array.isArray(article.tag_list) ? article.tag_list : ["hackathon"],
      prize_amount: null,
      eligibility: {
        target_audience: "Students & Developers",
        min_education: "None"
      },
      deadline,
      verified: true,
      active: true,
      is_active: true,
      status: "active",
      posted_at: publishedAt.toISOString(),
      first_seen_at: now,
      last_seen_at: now,
      last_verified_at: now,
      created_at: now,
      updated_at: now,
      content_hash: this.computeHash(title, organization, article.description, deadline, applyUrl)
    };
  }
}
