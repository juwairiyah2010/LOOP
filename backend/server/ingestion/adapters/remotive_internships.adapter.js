import { BaseSourceAdapter } from "../base.adapter.js";
import crypto from "crypto";

export class RemotiveInternshipsAdapter extends BaseSourceAdapter {
  constructor() {
    super("remotive_internships");
  }

  async fetch() {
    const url = "https://remotive.com/api/remote-jobs?category=software-dev&limit=25";
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "LOOP-Opportunity-Aggregator/1.0" },
        signal: AbortSignal.timeout(10000)
      });
      if (!res.ok) throw new Error(`Remotive HTTP status ${res.status}`);
      const data = await res.json();
      return Array.isArray(data.jobs) ? data.jobs : [];
    } catch (err) {
      console.warn("[RemotiveAdapter] Fetch failed:", err.message);
      return [];
    }
  }

  stripHtml(html = "") {
    return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  }

  normalize(job) {
    const title = (job.title || "").trim();
    const organization = (job.company_name || "").trim();
    const sourceId = String(job.id);
    const canonicalId = "remotive_" + crypto.createHash("md5").update(`remotive_${sourceId}`).digest("hex").substring(0, 16);
    const now = new Date().toISOString();

    const lowerTitle = title.toLowerCase();
    let category = "job";
    if (lowerTitle.includes("intern")) category = "internship";
    else if (lowerTitle.includes("fellow")) category = "fellowship";

    const cleanDesc = this.stripHtml(job.description).substring(0, 1200);
    const applyUrl = job.url || "https://remotive.com";
    const pubDate = job.publication_date ? new Date(job.publication_date) : new Date();
    const deadline = new Date(pubDate.getTime() + 45 * 24 * 3600 * 1000).toISOString();

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
      location: job.candidate_required_location || "Worldwide Remote",
      work_mode: "remote",
      tags: Array.isArray(job.tags) && job.tags.length > 0 ? job.tags : ["Software Development"],
      prize_amount: job.salary || null,
      eligibility: {
        target_audience: "Students & Developers",
        min_education: "Undergraduate / Self-taught"
      },
      deadline,
      verified: true,
      active: true,
      is_active: true,
      status: "active",
      posted_at: pubDate.toISOString(),
      first_seen_at: now,
      last_seen_at: now,
      last_verified_at: now,
      created_at: now,
      updated_at: now,
      content_hash: this.computeHash(title, organization, cleanDesc, deadline, applyUrl)
    };
  }
}
