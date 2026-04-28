import { type PlatformName, RateLimitedError } from "./types.js";

interface PlatformQuota {
  /** Maximum requests in the window. */
  capacity: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

/**
 * Default platform quotas. Conservative; can be overridden per-account in
 * config when a user has higher-tier access.
 *
 * Sources of these defaults:
 *   - Meta: ~200 calls/hour/user/app baseline (Marketing API specifics differ;
 *     the real Meta limit is points-based and per-endpoint, but a sliding
 *     hourly window is a safe approximation for the limiter's purpose)
 *   - LinkedIn: 100 req/min baseline (Marketing API uses a daily point bucket;
 *     per-minute is the limiter's coarse guard)
 *   - Google Ads: 10 RPS soft cap for basic-access developer tokens
 *   - GA4 Data API: 10 QPS per project per token
 *   - GSC: 1200 QPM per site (~20 RPS)
 *
 * If a platform's API returns a 429, we honor its retry-after and surface
 * RateLimitedError with the actual delay; we do not silently retry.
 */
const DEFAULT_QUOTAS: Record<PlatformName, PlatformQuota> = {
  meta: { capacity: 200, windowMs: 60 * 60 * 1000 },
  linkedin: { capacity: 100, windowMs: 60 * 1000 },
  google_ads: { capacity: 600, windowMs: 60 * 1000 },
  ga4: { capacity: 600, windowMs: 60 * 1000 },
  gsc: { capacity: 1200, windowMs: 60 * 1000 },
};

interface PlatformBucket {
  quota: PlatformQuota;
  /** Sorted ascending; each entry is the timestamp (ms) of a recorded request. */
  history: number[];
}

/**
 * Sliding-window rate limiter, per platform.
 *
 * Usage:
 *   const limiter = new RateLimiter();
 *   await limiter.acquire("meta"); // throws RateLimitedError when over quota
 *   // ... make API call
 */
export class RateLimiter {
  private readonly buckets: Map<PlatformName, PlatformBucket>;
  private readonly now: () => number;

  constructor(
    overrides: Partial<Record<PlatformName, PlatformQuota>> = {},
    now: () => number = () => Date.now(),
  ) {
    this.now = now;
    this.buckets = new Map();
    for (const [platform, defaultQuota] of Object.entries(DEFAULT_QUOTAS) as Array<
      [PlatformName, PlatformQuota]
    >) {
      const quota = overrides[platform] ?? defaultQuota;
      this.buckets.set(platform, { quota, history: [] });
    }
  }

  /**
   * Reserve one request slot for the given platform. Throws RateLimitedError
   * if the bucket is full. Caller should catch and either delay-retry or
   * surface the error.
   */
  acquire(platform: PlatformName): void {
    const bucket = this.buckets.get(platform);
    if (!bucket) {
      throw new Error(`Unknown platform: ${platform}`);
    }
    const nowMs = this.now();
    const cutoff = nowMs - bucket.quota.windowMs;
    // prune expired history
    while (bucket.history.length > 0 && bucket.history[0]! < cutoff) {
      bucket.history.shift();
    }
    if (bucket.history.length >= bucket.quota.capacity) {
      const oldest = bucket.history[0]!;
      const retryAfterMs = oldest + bucket.quota.windowMs - nowMs;
      throw new RateLimitedError(
        `Local rate limit reached for ${platform}: ${bucket.quota.capacity} requests per ${bucket.quota.windowMs}ms. Retry in ${retryAfterMs}ms.`,
        retryAfterMs,
        platform,
      );
    }
    bucket.history.push(nowMs);
  }

  /** Inspect current usage. Useful for `core.diagnose`. */
  status(platform: PlatformName): {
    used: number;
    capacity: number;
    windowMs: number;
    resetMs: number;
  } {
    const bucket = this.buckets.get(platform);
    if (!bucket) throw new Error(`Unknown platform: ${platform}`);
    const nowMs = this.now();
    const cutoff = nowMs - bucket.quota.windowMs;
    while (bucket.history.length > 0 && bucket.history[0]! < cutoff) {
      bucket.history.shift();
    }
    const oldest = bucket.history[0];
    return {
      used: bucket.history.length,
      capacity: bucket.quota.capacity,
      windowMs: bucket.quota.windowMs,
      resetMs: oldest === undefined ? 0 : oldest + bucket.quota.windowMs - nowMs,
    };
  }
}
