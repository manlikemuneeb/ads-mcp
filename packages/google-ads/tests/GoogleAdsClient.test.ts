import { type GoogleAdsAccount, RateLimitedError, RateLimiter } from "@manlikemuneeb/ads-mcp-core";
import { describe, expect, it } from "vitest";
import { GoogleAdsClient } from "../src/GoogleAdsClient.js";

const credsJson = JSON.stringify({
  type: "authorized_user",
  client_id: "fake-client",
  client_secret: "fake-secret",
  refresh_token: "fake-refresh",
});

const account: GoogleAdsAccount = {
  label: "test",
  mode: "read",
  customer_id: "1234567890",
  login_customer_id: "9876543210",
  developer_token_ref: { kind: "inline", value: "dev-token" },
  oauth_credentials_ref: { kind: "inline", value: credsJson },
};

describe("GoogleAdsClient", () => {
  it("attaches developer-token, login-customer-id, and bearer access token", async () => {
    const requests: Array<{ url: string; headers: Headers; body?: string }> = [];
    const fetch = async (url: string, init?: RequestInit) => {
      requests.push({ url, headers: new Headers(init?.headers), body: init?.body as string });
      if (url.includes("oauth2.googleapis.com")) {
        return new Response(JSON.stringify({ access_token: "real-token", expires_in: 3600 }), { status: 200 });
      }
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    };
    const c = new GoogleAdsClient(account, new RateLimiter(), fetch);
    await c.search("SELECT campaign.id FROM campaign LIMIT 1");

    const apiCall = requests.find((r) => r.url.includes("googleads.googleapis.com"));
    expect(apiCall).toBeDefined();
    expect(apiCall?.headers.get("Authorization")).toBe("Bearer real-token");
    expect(apiCall?.headers.get("developer-token")).toBe("dev-token");
    expect(apiCall?.headers.get("login-customer-id")).toBe("9876543210");
    expect(apiCall?.url).toContain("/customers/1234567890/googleAds:search");
  });

  it("converts 429 into RateLimitedError", async () => {
    const fetch = async (url: string) => {
      if (url.includes("oauth2.googleapis.com")) {
        return new Response(JSON.stringify({ access_token: "t", expires_in: 3600 }), { status: 200 });
      }
      return new Response("rate limited", { status: 429, headers: { "retry-after": "45" } });
    };
    const c = new GoogleAdsClient(account, new RateLimiter(), fetch);
    try {
      await c.search("SELECT campaign.id FROM campaign LIMIT 1");
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(RateLimitedError);
      expect((err as RateLimitedError).retryAfterMs).toBe(45_000);
    }
  });

  it("surfaces structured error on Google's error envelope", async () => {
    const fetch = async (url: string) => {
      if (url.includes("oauth2.googleapis.com")) {
        return new Response(JSON.stringify({ access_token: "t", expires_in: 3600 }), { status: 200 });
      }
      return new Response(
        JSON.stringify({ error: { code: 400, message: "Invalid customer ID", status: "INVALID_ARGUMENT" } }),
        { status: 400 },
      );
    };
    const c = new GoogleAdsClient(account, new RateLimiter(), fetch);
    await expect(c.search("SELECT 1")).rejects.toMatchObject({
      name: "GoogleAdsApiError",
      status: 400,
      errorCode: "INVALID_ARGUMENT",
    });
  });

  it("mutateCampaigns posts the right body shape", async () => {
    let posted: string | undefined;
    const fetch = async (url: string, init?: RequestInit) => {
      if (url.includes("oauth2.googleapis.com")) {
        return new Response(JSON.stringify({ access_token: "t", expires_in: 3600 }), { status: 200 });
      }
      posted = init?.body as string;
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    };
    const c = new GoogleAdsClient(account, new RateLimiter(), fetch);
    await c.mutateCampaigns([
      { update: { resourceName: "customers/x/campaigns/y", status: "PAUSED" }, updateMask: "status" },
    ]);
    expect(posted).toBeDefined();
    const body = JSON.parse(posted ?? "{}");
    expect(body.operations[0].update.status).toBe("PAUSED");
    expect(body.operations[0].updateMask).toBe("status");
  });
});
