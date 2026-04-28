import type { GoogleAdsAccount } from "@manlikemuneeb/ads-mcp-core";
import { describe, expect, it } from "vitest";
import { googleAuthForAdsAccount } from "../src/GoogleAuth.js";

const credsJson = JSON.stringify({
  type: "authorized_user",
  client_id: "fake-client",
  client_secret: "fake-secret",
  refresh_token: "fake-refresh",
});

const account: GoogleAdsAccount = {
  label: "test",
  mode: "read",
  customer_id: "9999999999",
  developer_token_ref: { kind: "inline", value: "dev-token" },
  oauth_credentials_ref: { kind: "inline", value: credsJson },
};

describe("googleAuthForAdsAccount", () => {
  it("refreshes and caches the access token", async () => {
    let calls = 0;
    const now = 1000;
    const fetch = async () => {
      calls++;
      return new Response(JSON.stringify({ access_token: "abc", expires_in: 3600 }), { status: 200 });
    };
    const auth = googleAuthForAdsAccount(account, fetch, () => now);
    expect(await auth.getAccessToken()).toBe("abc");
    expect(await auth.getAccessToken()).toBe("abc");
    expect(calls).toBe(1);
  });

  it("re-refreshes after expiry", async () => {
    let calls = 0;
    let now = 1000;
    const fetch = async () => {
      calls++;
      return new Response(JSON.stringify({ access_token: `t${calls}`, expires_in: 60 }), { status: 200 });
    };
    const auth = googleAuthForAdsAccount(account, fetch, () => now);
    expect(await auth.getAccessToken()).toBe("t1");
    now += 60_000;
    expect(await auth.getAccessToken()).toBe("t2");
    expect(calls).toBe(2);
  });

  it("rejects credentials of the wrong type", async () => {
    const badAccount: GoogleAdsAccount = {
      ...account,
      oauth_credentials_ref: { kind: "inline", value: JSON.stringify({ type: "service_account" }) },
    };
    const fetch = async () => new Response("{}", { status: 200 });
    const auth = googleAuthForAdsAccount(badAccount, fetch);
    await expect(auth.getAccessToken()).rejects.toThrow(/authorized_user/);
  });

  it("surfaces refresh failures", async () => {
    const fetch = async () => new Response("invalid_grant", { status: 400 });
    const auth = googleAuthForAdsAccount(account, fetch);
    await expect(auth.getAccessToken()).rejects.toThrow(/refresh failed/);
  });
});
