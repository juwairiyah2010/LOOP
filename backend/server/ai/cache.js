import crypto from "crypto";

/**
 * High-performance In-Memory LRU/TTL Cache for AI results.
 * Supports configurable TTLs, hashing for large objects, and cache statistics.
 */
export class AICache {
  constructor(maxItems = 1000, defaultTtlMs = 1000 * 60 * 60 * 2) { // 2 hours default
    this.maxItems = maxItems;
    this.defaultTtlMs = defaultTtlMs;
    this.store = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      evictions: 0
    };
  }

  /**
   * Generates a stable sha256 hash for complex objects or strings.
   */
  static hash(val) {
    if (typeof val === "string") {
      return crypto.createHash("sha256").update(val).digest("hex").slice(0, 16);
    }
    try {
      const serialized = JSON.stringify(val);
      return crypto.createHash("sha256").update(serialized).digest("hex").slice(0, 16);
    } catch {
      return String(val);
    }
  }

  /**
   * Retrieves an item from cache if not expired.
   * @param {string} key 
   * @returns {any|null}
   */
  get(key) {
    if (!key) return null;
    const entry = this.store.get(key);
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      this.stats.misses++;
      return null;
    }

    // Refresh LRU position
    this.store.delete(key);
    this.store.set(key, entry);

    this.stats.hits++;
    return entry.value;
  }

  /**
   * Stores an item with an optional TTL.
   * @param {string} key 
   * @param {any} value 
   * @param {number} [ttlMs] 
   */
  set(key, value, ttlMs) {
    if (!key || value === undefined) return;
    const expiry = Date.now() + (ttlMs || this.defaultTtlMs);

    // Evict oldest if full
    if (this.store.size >= this.maxItems) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey) {
        this.store.delete(oldestKey);
        this.stats.evictions++;
      }
    }

    this.store.set(key, { value, expiresAt: expiry });
    this.stats.sets++;
  }

  /**
   * Removes a specific key.
   */
  delete(key) {
    return this.store.delete(key);
  }

  /**
   * Invalidates entries matching a prefix.
   */
  invalidatePrefix(prefix) {
    let count = 0;
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
        count++;
      }
    }
    return count;
  }

  /**
   * Returns cache metrics.
   */
  getStats() {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? ((this.stats.hits / total) * 100).toFixed(1) + "%" : "0%";
    return {
      size: this.store.size,
      maxItems: this.maxItems,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate,
      evictions: this.stats.evictions
    };
  }

  /**
   * Clears the entire cache.
   */
  clear() {
    this.store.clear();
  }
}

// Global shared AI cache instance
export const globalAICache = new AICache(2000, 1000 * 60 * 60 * 3); // 3 hours default
