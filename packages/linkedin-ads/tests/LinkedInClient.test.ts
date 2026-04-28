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

  describe("auto-refresh on 401", () => {
    const refreshAccount: LinkedInAccount = {
      label: "rt-test",
      mode: "read",
      ad_account_id: "999",
      token_ref: { kind: "inline", value: "STALE_ACCESS" },
      refresh_token_ref: { kind: "inline", value: "MY_REFRESH_TOKEN" },
      client_id_ref: { kind: "inline", value: "client-id" },
      client_secret_ref: { kind: "inline", value: "client-secret" },
    };

    it("hasAutoRefresh() reports true when refresh fields are present", () => {
      const c = new LinkedInClient(refreshAccount, new RateLimiter());
      expect(c.hasAutoRefresh()).toBe(true);
    });

    it("hasAutoRefresh() reports false on a legacy static-token account", () => {
      const c = new LinkedInClient(account, new RateLimiter());
      expect(c.hasAutoRefresh()).toBe(false);
    });

    it("retries the request after a 401, using a freshly minted access token", async () => {
      let restCalls = 0;
      let oauthCalls = 0;
      const restAuthHeaders: string[] = [];
      const accessTokens = ["FIRST_ACCESS", "SECOND_ACCESS"];

      const fetch = async (url: string, init?: RequestInit) => {
        if (url.includes("/oauth/v2/accessToken")) {
          // Each refresh hands out the next token in the queue so we can
          // tell the original cached token from the post-401 freshly-minted one.
          const token = accessTokens[oauthCalls] ?? "FALLBACK";
          oauthCalls++;
          return new Response(
            JSON.stringify({ access_token: token, expires_in: 3600 }),
            { status: 200 },
          );
        }
        restCalls++;
        restAuthHeaders.push(
          new Headers(init?.headers).get("Authorization") ?? "",
        );
        // First REST call: 401 (simulating an expired access token that
        // somehow got past the cached expiry). Second call: succeeds.
        if (restCalls === 1) {
          return new Response(JSON.stringify({ message: "Unauthorized" }), {
            status: 401,
          });
        }
        return new Response(JSON.stringify({ elements: ["ok"] }), {
          status: 200,
        });
      };

      const c = new LinkedInClient(refreshAccount, new RateLimiter(), fetch);
      const result = await c.get("/adCampaigns", { q: "search" });
      expect(result).toEqual({ elements: ["ok"] });

      // 2 REST calls (the original 401 + the retry), 2 OAuth calls
      // (the initial token mint + the post-401 invalidate-and-refresh).
      expect(restCalls).toBe(2);
      expect(oauthCalls).toBe(2);
      // First REST call carried the FIRST_ACCESS token; after the 401 the
      // TokenManager invalidates and re-refreshes, so retry gets SECOND_ACCESS.
      expect(restAuthHeaders[0]).toBe("Bearer FIRST_ACCESS");
      expect(restAuthHeaders[1]).toBe("Bearer SECOND_ACCESS");
    });

    it("does not retry a non-401 error", async () => {
      let restCalls = 0;
      const fetch = async (url: string) => {
        if (url.includes("/oauth/v2/accessToken")) {
          return new Response(
            JSON.stringify({ access_token: "X", expires_in: 3600 }),
            { status: 200 },
          );
        }
        restCalls++;
        return new Response(
          JSON.stringify({ message: "Forbidden", serviceErrorCode: 100 }),
          { status: 403 },
        );
      };
      const c = new LinkedInClient(refreshAccount, new RateLimiter(), fetch);
      await expect(c.get("/adCampaigns")).rejects.toMatchObject({
        status: 403,
      });
      expect(restCalls).toBe(1);
    });
  });
});
