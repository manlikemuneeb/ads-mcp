import { type MetaAccount, RateLimitedError, RateLimiter } from "@manlikemuneeb/ads-mcp-core";
import { describe, expect, it } from "vitest";
import { MetaClient } from "../src/MetaClient.js";

const account: MetaAccount = {
  label: "test",
  mode: "read",
  ad_account_id: "act_123",
  token_ref: { kind: "inline", value: "test-token" },
};

describe("MetaClient", () => {
  it("prefixes ad_account_id with act_ when missing", () => {
    const c = new MetaClient(
      { ...account, ad_account_id: "999" },
      new RateLimiter(),
      async () => new Response("{}", { status: 200 }),
    );
    expect(c.getAccountPath()).toBe("act_999");
  });

  it("uses Authorization header, not URL query string", async () => {
    let capturedUrl = "";
    let capturedHeaders: Headers | undefined;
    const fetch = async (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    };
    const c = new MetaClient(account, new RateLimiter(), fetch);
    await c.get("/foo", { fields: "name" });
    expect(capturedUrl).not.toContain("access_token=");
    expect(capturedHeaders?.get("Authorization")).toBe("Bearer test-token");
  });

  it("surfaces RateLimitedError on Meta rate-limit codes", async () => {
    const fetch = async () =>
      new Response(JSON.stringify({ error: { code: 17, message: "User request limit reached" } }), {
        status: 400,
      });
    const c = new MetaClient(account, new RateLimiter(), fetch);
    await expect(c.get("/foo")).rejects.toBeInstanceOf(RateLimitedError);
  });

  it("surfaces structured MetaApiError on other failures", async () => {
    const fetch = async () =>
      new Response(JSON.stringify({ error: { code: 100, message: "Invalid parameter" } }), {
        status: 400,
      });
    const c = new MetaClient(account, new RateLimiter(), fetch);
    await expect(c.get("/foo")).rejects.toMatchObject({
      name: "MetaApiError",
      status: 400,
      fbCode: 100,
    });
  });

  it("calls rateLimiter.acquire before each request", async () => {
    let acquired = 0;
    const limiter = new RateLimiter();
    const original = limiter.acquire.bind(limiter);
    limiter.acquire = (p) => {
      acquired++;
      return original(p);
    };
    const fetch = async () => new Response(JSON.stringify({ data: [] }), { status: 200 });
    const c = new MetaClient(account, limiter, fetch);
    await c.get("/foo");
    await c.get("/bar");
    expect(acquired).toBe(2);
  });
});
