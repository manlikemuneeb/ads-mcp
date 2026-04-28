import { describe, expect, it } from "vitest";
import { RateLimiter } from "../src/RateLimiter.js";
import { RateLimitedError } from "../src/types.js";

describe("RateLimiter", () => {
  it("allows requests under capacity", () => {
    const limiter = new RateLimiter({ meta: { capacity: 3, windowMs: 1000 } }, () => 0);
    expect(() => limiter.acquire("meta")).not.toThrow();
    expect(() => limiter.acquire("meta")).not.toThrow();
    expect(() => limiter.acquire("meta")).not.toThrow();
  });

  it("throws RateLimitedError when capacity exhausted", () => {
    let now = 0;
    const limiter = new RateLimiter({ meta: { capacity: 2, windowMs: 1000 } }, () => now);
    limiter.acquire("meta");
    limiter.acquire("meta");
    expect(() => limiter.acquire("meta")).toThrow(RateLimitedError);
  });

  it("provides retry-after that respects the window", () => {
    let now = 0;
    const limiter = new RateLimiter({ meta: { capacity: 1, windowMs: 1000 } }, () => now);
    limiter.acquire("meta");
    now = 200;
    try {
      limiter.acquire("meta");
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(RateLimitedError);
      expect((err as RateLimitedError).retryAfterMs).toBe(800);
    }
  });

  it("expires entries past the window", () => {
    let now = 0;
    const limiter = new RateLimiter({ meta: { capacity: 1, windowMs: 1000 } }, () => now);
    limiter.acquire("meta");
    now = 1500;
    expect(() => limiter.acquire("meta")).not.toThrow();
  });

  it("status reports usage", () => {
    let now = 0;
    const limiter = new RateLimiter({ meta: { capacity: 5, windowMs: 1000 } }, () => now);
    limiter.acquire("meta");
    limiter.acquire("meta");
    const s = limiter.status("meta");
    expect(s.used).toBe(2);
    expect(s.capacity).toBe(5);
  });

  it("treats platforms independently", () => {
    let now = 0;
    const limiter = new RateLimiter(
      { meta: { capacity: 1, windowMs: 1000 }, linkedin: { capacity: 1, windowMs: 1000 } },
      () => now,
    );
    limiter.acquire("meta");
    expect(() => limiter.acquire("linkedin")).not.toThrow();
    expect(() => limiter.acquire("meta")).toThrow(RateLimitedError);
  });
});
