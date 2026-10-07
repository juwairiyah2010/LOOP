export function computeQualityScore(opp = {}) {
  let score = 0;

  // 1. Source Reliability (max 25 pts)
  const source = opp.source || "legacy";
  const trustedSources = ["devto_hackathons", "remotive_internships", "arbeitnow_opportunities", "sample_aggregator"];
  if (trustedSources.includes(source)) {
    score += 25;
  } else if (source === "legacy") {
    score += 18;
  } else if (source === "ai_generated") {
    score += 10;
  } else {
    score += 15;
  }

  // 2. Verification Status (max 20 pts)
  // NEVER call an opportunity "verified" without evidence!
  if (opp.verified === true) {
    score += 20;
  }

  // 3. Freshness (max 15 pts)
  const lastVerified = opp.last_verified_at ? new Date(opp.last_verified_at) : (opp.first_seen_at ? new Date(opp.first_seen_at) : new Date());
  const daysDiff = (Date.now() - (isNaN(lastVerified.getTime()) ? Date.now() : lastVerified.getTime())) / (1000 * 3600 * 24);
  if (daysDiff <= 7) score += 15;
  else if (daysDiff <= 30) score += 10;
  else score += 5;

  // 4. Valid Application URL (max 15 pts)
  const applyUrl = opp.apply_url || opp.source_url || "";
  if (typeof applyUrl === "string" && applyUrl.startsWith("https://")) score += 15;
  else if (typeof applyUrl === "string" && applyUrl.startsWith("http://")) score += 10;

  // 5. Deadline Confidence (max 10 pts)
  if (opp.deadline) {
    const d = new Date(opp.deadline);
    if (!isNaN(d.getTime())) {
      if (d >= new Date()) score += 10;
    } else {
      score += 5;
    }
  } else {
    score += 5;
  }

  // 6. Organization Information (max 10 pts)
  const org = (opp.organization || "").trim();
  if (org.length > 2 && org.toLowerCase() !== "unknown" && org.toLowerCase() !== "ai generated") {
    score += 10;
  } else {
    score += 3;
  }

  // 7. Content Completeness (max 5 pts)
  const desc = (opp.description || "").trim();
  const tags = Array.isArray(opp.tags) ? opp.tags : [];
  if (desc.length >= 80 && tags.length >= 1) {
    score += 5;
  } else if (desc.length > 20) {
    score += 2;
  }

  return Math.min(100, Math.max(0, Math.round(score)));
}
