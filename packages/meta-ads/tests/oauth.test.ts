import { describe, expect, it } from "vitest";
import { META_PROVIDER, upgradeMetaToken } from "../src/oauth.js";

describe("Meta OAuth provider", () => {
  it("provider config has the expected shape", () => {
    expect(META_PROVIDER.name).toBe("meta");
    expect(META_PROVIDER.usePkce).toBe(false);
    expect(META_PROVIDER.issuesRefreshToken).toBe(false);
    expect(META_PROVIDER.scopes).toContain("ads_read");
    expect(META_PROVIDER.scopes).toContain("ads_management");
    expect(META_PROVIDER.authorizeUrl).toMatch(/facebook\.com\/v\d+\.\d+\/dialog\/oauth/);
    expect(META_PROVIDER.tokenUrl).toMatch(/graph\.facebook\.com\/v\d+\.\d+\/oauth\/access_token/);
  });

  describe("upgradeMetaToken", () => {
    it("hits the fb_exchange_token grant and returns a long-lived token", async () => {
      let capturedUrl = "";
      const fetchImpl = async (url: string) => {
        capturedUrl = url;
        return new Response(
          JSON.stringify({
            access_token: "LONG_LIVED",
            expires_in: 5_184_000, // 60 days in seconds
            token_type: "bearer",
          }),
          { status: 200 },
        );
      };
      const tokens = await upgradeMetaToken(
        { client_id: "app123", client_secret: "secret" },
        "SHORT_LIVED",
        fetchImpl,
      );
      expect(tokens.access_token).toBe("LONG_LIVED");
      expect(tokens.token_type).toBe("bearer");
      expect(tokens.expires_at).toBeGreaterThan(Date.now() + 50 * 86_400_000);
      // URL should encode all 4 query params and use fb_exchange_token grant.
      expect(capturedUrl).toContain("grant_type=fb_exchange_token");
      expect(capturedUrl).toContain("client_id=app123");
      expect(capturedUrl).toContain("client_secret=secret");
      expect(capturedUrl).toContain("fb_exchange_token=SHORT_LIVED");
    });

    it("throws when the credentials lack a client_secret", async () => {
      await expect(
        upgradeMetaToken({ client_id: "x" }, "SHORT", async () => new Response("{}")),
      ).rejects.toThrow(/client_secret/);
    });

    it("propagates a non-2xx response with its body", async () => {
      const fetchImpl = async () =>
        new Response(JSON.stringify({ error: { message: "expired" } }), { status: 400 });
      await expect(
        upgradeMetaToken(
          { client_id: "a", client_secret: "b" },
          "S",
          fetchImpl,
        ),
      ).rejects.toThrow(/long-lived token exchange failed \(400\)/);
    });
  });
});
