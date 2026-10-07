import { normalizeOrganization, normalizeTitle } from "./normalizer.js";

/**
 * Calculates Token Similarity (Jaccard Index) between two strings
 */
function tokenSimilarity(str1 = "", str2 = "") {
  const set1 = new Set(str1.toLowerCase().replace(/[^a-z0-9]/g, " ").split(/\s+/).filter(Boolean));
  const set2 = new Set(str2.toLowerCase().replace(/[^a-z0-9]/g, " ").split(/\s+/).filter(Boolean));
  if (set1.size === 0 || set2.size === 0) return 0;

  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);

  return intersection.size / union.size;
}

export class Deduplicator {
  /**
   * Multi-tier deduplication check against database collection
   * Tier 1: source + source_id
   * Tier 2: clean apply_url / source_url
   * Tier 3: normalized organization + normalized title
   * Tier 4: Fuzzy similarity (Org similarity > 0.85 AND Title similarity > 0.85 AND same Category)
   * 
   * CRITICAL SECURITY DIRECTIVE: Never merge opportunities based on title alone!
   */
  static async findExisting(coll, opp) {
    if (!opp) return null;

    // Tier 1: Source + Source ID
    if (opp.source && opp.source_id) {
      const match1 = await coll.findOne({ source: opp.source, source_id: opp.source_id });
      if (match1) return { match: match1, tier: 1 };
    }

    // Tier 1b: Canonical ID
    if (opp.id) {
      const matchId = await coll.findOne({ id: opp.id });
      if (matchId) return { match: matchId, tier: 1 };
    }

    // Tier 2: Clean Apply URL / Source URL
    if (opp.apply_url) {
      const match2 = await coll.findOne({ $or: [{ apply_url: opp.apply_url }, { source_url: opp.apply_url }] });
      if (match2) return { match: match2, tier: 2 };
    }

    // Tier 3: Organization + Title Exact Match
    const normOrg = normalizeOrganization(opp.organization);
    const normTitle = normalizeTitle(opp.title);

    if (normOrg && normTitle) {
      const candidates = await coll.find({ category: opp.category }).toArray();
      for (const candidate of candidates) {
        const candidateOrg = normalizeOrganization(candidate.organization);
        const candidateTitle = normalizeTitle(candidate.title);

        if (candidateOrg === normOrg && candidateTitle === normTitle) {
          return { match: candidate, tier: 3 };
        }
      }

      // Tier 4: Fuzzy Similarity (Org > 0.85 AND Title > 0.85 AND Same Category)
      // NEVER match on title alone!
      for (const candidate of candidates) {
        const candidateOrg = normalizeOrganization(candidate.organization);
        const candidateTitle = normalizeTitle(candidate.title);

        const orgSim = tokenSimilarity(normOrg, candidateOrg);
        if (orgSim >= 0.85) {
          const titleSim = tokenSimilarity(normTitle, candidateTitle);
          if (titleSim >= 0.85) {
            return { match: candidate, tier: 4 };
          }
        }
      }
    }

    return null;
  }
}
