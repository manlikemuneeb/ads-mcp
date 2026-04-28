import {
  type LinkedInAccount,
  RateLimitedError,
  RateLimiter,
} from "@manlikemuneeb/ads-mcp-core";
import { describe, expect, it } from "vitest";
import { LinkedInClient } from "../src/LinkedInClient.js";

const account: LinkedInAccount = {
  label: "test",
  mode: "read",
  ad_account_id: "12345",
  token_ref: { kind: "inline", value: "test-token" },
};

describe("LinkedInClient", () => {
  it("sends Authorization, LinkedIn-Version, and Restli-Protocol headers", async () => {
    let capturedHeaders: Headers | undefined;
    const fetch = async (_url: string, init?: RequestInit) => {
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({ elements: [] }), { status: 200 });
    };
    const c = new LinkedInClient(account, new RateLimiter(), fetch);
    await c.get("/adCampaigns", { q: "search" });
    expect(capturedHeaders?.get("Authorization")).toBe("Bearer test-token");
    expect(capturedHeaders?.get("LinkedIn-Version")).toBe("202604");
    expect(capturedHeaders?.get("X-Restli-Protocol-Version")).toBe("2.0.0");
  });

  it("partialUpdate sets the X-RestLi-Method header and proper body shape", async () => {
    let capturedHeaders: Headers | undefined;
    let capturedBody: string | undefined;
    const fetch = async (_url: string, init?: RequestInit) => {
      capturedHeaders = new Headers(init?.headers);
      capturedBody = init?.body as string;
      return new Response("{}", { status: 200 });
    };
    const c = new LinkedInClient(account, new RateLimiter(), fetch);
    await c.partialUpdate("/adCampaigns/123", { status: "PAUSED" });
    expect(capturedHeaders?.get("X-RestLi-Method")).toBe("PARTIAL_UPDATE");
    expect(capturedBody).toBe('{"patch":{"$set":{"status":"PAUSED"}}}');
  });

  it("converts 429 + retry-after into RateLimitedError", async () => {
    const fetch = async () =>
      new Response("rate limited", {
        status: 429,
        headers: { "retry-after": "30" },
      });
    const c = new LinkedInClient(account, new RateLimiter(), fetch);
    try {
      await c.get("/foo");
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(RateLimitedError);
      expect((err as RateLimitedError).retryAfterMs).toBe(30_000);
    }
  });

  it("sends commas, parens, and colons raw in query values (LinkedIn requires this)", async () => {
    let capturedUrl = "";
    const fetch = async (url: string) => {
      capturedUrl = url;
      return new Response(JSON.stringify({ elements: [] }), { status: 200 });
    };
    const c = new LinkedInClient(account, new RateLimiter(), fetch);
    await c.get("/adAnalytics", {
      q: "analytics",
      fields: "impressions,clicks,costInLocalCurrency",
      accounts: "List(urn:li:sponsoredAccount:12345)",
      dateRange: "(start:(year:2026,month:4,day:1),end:(year:2026,month:4,day:30))",
    });
    // commas raw
    expect(capturedUrl).toContain("fields=impressions,clicks,costInLocalCurrency");
    expect(capturedUrl).not.toContain("%2C");
    // parens raw
    expect(capturedUrl).toContain("List(urn:li:sponsoredAccount:12345)");
    expect(capturedUrl).not.toContain("%28");
    expect(capturedUrl).not.toContain("%29");
    // colons raw
    expect(capturedUrl).not.toContain("%3A");
  });

  it("surfaces structured LinkedInApiError on non-rate-limit failures", async () => {
    const fetch = async () =>
      new Response(JSON.stringify({ message: "Forbidden", serviceErrorCode: 100 }), { status: 403 });
    const c = new LinkedInClient(account, new RateLimiter(), fetch);
    await expect(c.get("/foo")).rejects.toMatchObject({
      name: "LinkedInApiError",
      status: 403,
      serviceErrorCode: 100,
    });
  });
});
