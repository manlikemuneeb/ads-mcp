import { describe, expect, it } from "vitest";
import {
  LINKEDIN_PROVIDER,
  LINKEDIN_PROVIDER_READ_ONLY,
  refreshLinkedInAccessToken,
} from "../src/oauth.js";

describe("LinkedIn OAuth provider", () => {
  it("default provider includes write scope rw_ads and does NOT use PKCE (Standard app flow)", () => {
    expect(LINKEDIN_PROVIDER.name).toBe("linkedin");
    // LinkedIn Standard/Web apps must NOT send PKCE alongside client_secret —
    // doing so triggers a 401 invalid_client from the token endpoint. This
    // test guards against accidentally re-enabling PKCE.
    expect(LINKEDIN_PROVIDER.usePkce).toBe(false);
    expect(LINKEDIN_PROVIDER.issuesRefreshToken).toBe(true);
    expect(LINKEDIN_PROVIDER.scopes).toContain("rw_ads");
    expect(LINKEDIN_PROVIDER.scopes).toContain("r_ads_reporting");
  });

  it("read-only provider drops rw_ads", () => {
    expect(LINKEDIN_PROVIDER_READ_ONLY.scopes).not.toContain("rw_ads");
    expect(LINKEDIN_PROVIDER_READ_ONLY.scopes).toContain("r_ads");
    expect(LINKEDIN_PROVIDER_READ_ONLY.scopes).toContain("r_ads_reporting");
  });

  describe("refreshLinkedInAccessToken", () => {
    it("posts the refresh_token grant and parses the new tokens", async () => {
      let capturedBody = "";
      const fetchImpl = async (_url: string, init?: RequestInit) => {
        capturedBody = String(init?.body ?? "");
        return new Response(
          JSON.stringify({
            access_token: "FRESH",
            refresh_token: "ROTATED_REFRESH",
            expires_in: 5_184_000,
            scope: "r_ads,r_ads_reporting",
          }),
          { status: 200 },
        );
      };
      const tokens = await refreshLinkedInAccessToken(
        { client_id: "c", client_secret: "s" },
        "OLD_REFRESH",
        fetchImpl,
      );
      expect(tokens.access_token).toBe("FRESH");
      expect(tokens.refresh_token).toBe("ROTATED_REFRESH");
      expect(tokens.scope).toBe("r_ads,r_ads_reporting");
      expect(tokens.expires_at).toBeGreaterThan(Date.now() + 50 * 86_400_000);
      expect(capturedBody).toContain("grant_type=refresh_token");
      expect(capturedBody).toContain("refresh_token=OLD_REFRESH");
      expect(capturedBody).toContain("client_id=c");
      expect(capturedBody).toContain("client_secret=s");
    });

    it("throws when client_secret is missing", async () => {
      await expect(
        refreshLinkedInAccessToken(
          { client_id: "c" },
          "REFRESH",
          async () => new Response("{}", { status: 200 }),
        ),
      ).rejects.toThrow(/client_secret/);
    });

    it("propagates non-2xx responses", async () => {
      const fetchImpl = async () =>
        new Response(JSON.stringify({ error: "invalid_grant" }), { status: 401 });
      await expect(
        refreshLinkedInAccessToken(
          { client_id: "c", client_secret: "s" },
          "BAD",
          fetchImpl,
        ),
      ).rejects.toThrow(/refresh failed \(401\)/);
    });
  });
});
