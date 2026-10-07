import crypto from "crypto";

const SKILL_ALIASES = {
  reactjs: "React",
  react: "React",
  "node.js": "Node.js",
  nodejs: "Node.js",
  node: "Node.js",
  typescript: "TypeScript",
  ts: "TypeScript",
  javascript: "JavaScript",
  js: "JavaScript",
  python: "Python",
  py: "Python",
  ai: "AI",
  ml: "Machine Learning",
  machinelearning: "Machine Learning",
  "ui/ux": "UI/UX",
  ui: "UI/UX",
  ux: "UI/UX",
  design: "UI/UX",
  golang: "Go",
  cpp: "C++",
  csharp: "C#",
  postgressql: "PostgreSQL",
  postgres: "PostgreSQL",
  mongo: "MongoDB",
  mongodb: "MongoDB",
  aws: "AWS",
  gcp: "GCP",
  azure: "Azure",
  docker: "Docker",
  kubernetes: "Kubernetes",
  k8s: "Kubernetes"
};

export function normalizeTitle(title = "") {
  if (typeof title !== "string") return "";
  let clean = title
    .replace(/\(m\/w\/d\)/gi, "")
    .replace(/\[remote\]/gi, "")
    .replace(/\(remote\)/gi, "")
    .replace(/\(hiring immediately\)/gi, "")
    .replace(/\|\s*apply now/gi, "")
    .replace(/\*\*\*.*?\*\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return clean;
}

export function normalizeOrganization(org = "") {
  if (typeof org !== "string") return "";
  let clean = org
    .replace(/\b(inc|llc|gmbh|corp|corporation|ltd|limited|pvt|co|company|group)\b[.,]*/gi, "")
    .replace(/[.,\-\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return clean || org.trim();
}

export function normalizeUrl(url = "") {
  if (typeof url !== "string" || !url.trim()) return null;
  let str = url.trim();
  if (!str.startsWith("http://") && !str.startsWith("https://")) {
    str = "https://" + str;
  }
  try {
    const parsed = new URL(str);
    const paramsToKeep = new URLSearchParams();
    // Strip tracking parameters
    parsed.searchParams.forEach((val, key) => {
      const lowerKey = key.toLowerCase();
      if (!lowerKey.startsWith("utm_") && !["ref", "fbclid", "gclid", "source", "mc_eid"].includes(lowerKey)) {
        paramsToKeep.append(key, val);
      }
    });
    parsed.search = paramsToKeep.toString();
    return parsed.toString();
  } catch {
    return str;
  }
}

export function normalizeCategory(category = "", title = "", description = "") {
  const haystack = `${category} ${title} ${description}`.toLowerCase();

  if (haystack.includes("hackathon") || haystack.includes("hack")) return "hackathon";
  if (haystack.includes("competition") || haystack.includes("contest") || haystack.includes("challenge") || haystack.includes("compete")) return "competition";
  if (haystack.includes("fellowship") || haystack.includes("fellow") || haystack.includes("residency")) return "fellowship";
  if (haystack.includes("scholarship") || haystack.includes("bursary") || haystack.includes("tuition")) return "scholarship";
  if (haystack.includes("intern") || haystack.includes("praktik") || haystack.includes("co-op") || haystack.includes("coop") || haystack.includes("trainee")) return "internship";

  return "job";
}

export function normalizeTags(tags = []) {
  if (!Array.isArray(tags)) return [];
  const normalized = new Set();
  tags.forEach(rawTag => {
    if (!rawTag || typeof rawTag !== "string") return;
    const cleanTag = rawTag.trim();
    if (!cleanTag) return;
    const lower = cleanTag.toLowerCase().replace(/[^a-z0-9#+.]/g, "");
    const mapped = SKILL_ALIASES[lower] || cleanTag;
    normalized.add(mapped);
  });
  return Array.from(normalized);
}

export function normalizeWorkMode(workMode = "", location = "", title = "") {
  const haystack = `${workMode} ${location} ${title}`.toLowerCase();
  if (haystack.includes("remote") || haystack.includes("work from home") || haystack.includes("anywhere")) return "remote";
  if (haystack.includes("hybrid")) return "hybrid";
  return "onsite";
}

export function normalizeDate(dateStr = "") {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
  } catch {
    return null;
  }
}

export function normalizeOpportunity(opp = {}) {
  const title = normalizeTitle(opp.title);
  const organization = normalizeOrganization(opp.organization);
  const rawOrg = (opp.organization || "").trim();
  const category = normalizeCategory(opp.category, title, opp.description);
  const applyUrl = normalizeUrl(opp.apply_url || opp.source_url);
  const sourceUrl = normalizeUrl(opp.source_url || opp.apply_url);
  const tags = normalizeTags(opp.tags);
  const workMode = normalizeWorkMode(opp.work_mode, opp.location, title);
  const deadline = normalizeDate(opp.deadline);
  const postedAt = normalizeDate(opp.posted_at) || new Date().toISOString();
  const now = new Date().toISOString();

  const source = opp.source || "legacy";
  const sourceId = opp.source_id ? String(opp.source_id) : null;
  
  const contentRaw = `${title.toLowerCase()}_${organization.toLowerCase()}_${category}_${(applyUrl || "").toLowerCase()}`;
  const contentHash = crypto.createHash("sha256").update(contentRaw).digest("hex");

  const canonicalId = opp.id || (sourceId ? `${source}_${crypto.createHash("md5").update(sourceId).digest("hex").substring(0, 16)}` : `opp_${contentHash.substring(0, 16)}`);

  return {
    id: canonicalId,
    source,
    source_id: sourceId,
    source_url: sourceUrl,
    apply_url: applyUrl,
    title,
    organization: rawOrg || organization,
    organization_normalized: organization,
    category,
    description: (opp.description || "").trim(),
    location: (opp.location || "Remote").trim(),
    work_mode: workMode,
    tags,
    prize_amount: opp.prize_amount || null,
    eligibility: opp.eligibility || { target_audience: "Students & Developers" },
    deadline,
    verified: !!opp.verified,
    active: opp.active !== false && opp.is_active !== false,
    is_active: opp.active !== false && opp.is_active !== false,
    status: opp.status || "active",
    posted_at: postedAt,
    first_seen_at: opp.first_seen_at || now,
    last_seen_at: now,
    last_verified_at: now,
    created_at: opp.created_at || now,
    updated_at: now,
    content_hash: contentHash
  };
}
