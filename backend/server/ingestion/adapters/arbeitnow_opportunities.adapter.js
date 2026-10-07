import { BaseSourceAdapter } from "../base.adapter.js";
import crypto from "crypto";

export class ArbeitnowOpportunitiesAdapter extends BaseSourceAdapter {
  constructor() {
    super("arbeitnow_opportunities");
  }

  async fetch() {
    const url = "https://www.arbeitnow.com/api/job-board-api";
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "LOOP-Opportunity-Aggregator/1.0" },
        signal: AbortSignal.timeout(10000)
      });
      if (!res.ok) throw new Error(`Arbeitnow HTTP status ${res.status}`);
      const data = await res.json();
      return Array.isArray(data.data) ? data.data.slice(0, 30) : [];
    } catch (err) {
      console.warn("[ArbeitnowAdapter] Fetch failed:", err.message);
      return [];
    }
  }

  stripHtml(html = "") {
    return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  }

  normalize(job) {
    const title = (job.title || "").trim();
    const organization = (job.company_name || "").trim();
    const sourceId = String(job.slug || job.title);
    const canonicalId = "arbeitnow_" + crypto.createHash("md5").update(`arbeitnow_${sourceId}`).digest("hex").substring(0, 16);
    const now = new Date().toISOString();

    const lowerTitle = title.toLowerCase();
    let category = "job";
    if (lowerTitle.includes("intern") || lowerTitle.includes("praktik")) category = "internship";
    else if (lowerTitle.includes("fellow")) category = "fellowship";

    const cleanDesc = this.stripHtml(job.description).substring(0, 1200);
    const applyUrl = job.url || "https://arbeitnow.com";
    const createdAt = job.created_at ? new Date(job.created_at * 1000) : new Date();
    const deadline = new Date(createdAt.getTime() + 30 * 24 * 3600 * 1000).toISOString();

    return {
      id: canonicalId,
      source: this.name,
      source_id: sourceId,
      source_url: applyUrl,
      apply_url: applyUrl,
      title,
      organization,
      category,
      description: cleanDesc,
      location: job.location || "Remote / Flexible",
      work_mode: job.remote ? "remote" : "onsite",
      tags: Array.isArray(job.tags) && job.tags.length > 0 ? job.tags : ["Engineering"],
      prize_amount: null,
      eligibility: {
        target_audience: "Students & Graduates",
        min_education: "Undergraduate"
      },
      deadline,
      verified: true,
      active: true,
      is_active: true,
      status: "active",
      posted_at: createdAt.toISOString(),
      first_seen_at: now,
      last_seen_at: now,
      last_verified_at: now,
      created_at: now,
      updated_at: now,
      content_hash: this.computeHash(title, organization, cleanDesc, deadline, applyUrl)
    };
  }
}
