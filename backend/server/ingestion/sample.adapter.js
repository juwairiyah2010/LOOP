import { BaseSourceAdapter } from "./base.adapter.js";
import crypto from "crypto";

export class SampleSourceAdapter extends BaseSourceAdapter {
  constructor() {
    super("sample_aggregator");
  }

  async fetch() {
    return [
      {
        ext_id: "sample_001",
        job_title: "AI Research Assistant Fellowship 2027",
        company: "DeepMind / Open Research",
        type: "fellowship",
        summary: "Full-time research fellowship focusing on neural architecture search and generative models for science.",
        location_name: "London, UK",
        is_remote: false,
        work_type: "hybrid",
        apply_link: "https://example.com/fellowship-deepmind",
        due_date: "2026-12-15T23:59:59.000Z",
        skills_required: ["Python", "PyTorch", "Deep Learning", "AI"],
        reward: "$85,000 / year",
        is_verified_program: true
      },
      {
        ext_id: "sample_002",
        job_title: "Global Student Hackathon 2026",
        company: "HackGlobal Org",
        type: "hackathon",
        summary: "Build open-source solutions for climate tech and education. Over $50,000 in prizes.",
        location_name: "Global Remote",
        is_remote: true,
        work_type: "remote",
        apply_link: "https://example.com/hackglobal-2026",
        due_date: "2026-11-20T18:00:00.000Z",
        skills_required: ["React", "Node.js", "Python", "UI/UX", "Open Source"],
        reward: "$50,000",
        is_verified_program: true
      }
    ];
  }

  normalize(raw) {
    const title = (raw.job_title || "").trim();
    const organization = (raw.company || "").trim();
    const sourceId = String(raw.ext_id || "");
    const canonicalId = "sample_" + crypto.createHash("md5").update(`${this.name}_${sourceId}`).digest("hex").substring(0, 16);
    const now = new Date().toISOString();

    const categoryMap = {
      fellowship: "fellowship",
      hackathon: "hackathon",
      internship: "internship",
      scholarship: "scholarship",
      competition: "competition",
      job: "job"
    };

    const category = categoryMap[raw.type?.toLowerCase()] || "internship";

    return {
      id: canonicalId,
      source: this.name,
      source_id: sourceId,
      source_url: raw.apply_link || null,
      apply_url: raw.apply_link || null,
      title,
      organization,
      category,
      description: raw.summary || "",
      location: raw.location_name || "Remote",
      work_mode: raw.work_type || (raw.is_remote ? "remote" : "onsite"),
      tags: Array.isArray(raw.skills_required) ? raw.skills_required : [],
      prize_amount: raw.reward || null,
      eligibility: {
        target_audience: "Students & Recent Grads",
        min_education: "Undergraduate"
      },
      deadline: raw.due_date || null,
      verified: !!raw.is_verified_program,
      active: true,
      is_active: true,
      status: "active",
      posted_at: now,
      first_seen_at: now,
      last_seen_at: now,
      last_verified_at: now,
      created_at: now,
      updated_at: now,
      content_hash: this.computeHash(title, organization, raw.summary, raw.due_date, raw.apply_link)
    };
  }
}
