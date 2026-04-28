import { describe, expect, it } from "vitest";
import {
  GOOGLE_PROVIDER_FULL,
  GOOGLE_SCOPES,
  buildAuthorizeUrl,
  googleProviderForScopes,
  refreshGoogleAccessToken,
} from "../src/OAuth/index.js";

describe("Google OAuth provider", () => {
  it("full provider lists all four product scopes", () => {
    const s = GOOGLE_PROVIDER_FULL.scopes;
    expect(s).toContain(GOOGLE_SCOPES.ads);
    expect(s).toContain(GOOGLE_SCOPES.ga4Read);
    expect(s).toContain(GOOGLE_SCOPES.ga4Edit);
    expect(s).toContain(GOOGLE_SCOPES.gsc);
  });

  it("authorize URL forces a refresh-token-yielding consent flow", () => {
    const url = buildAuthorizeUrl({
      provider: GOOGLE_PROVIDER_FULL,
      clientId: "c",
      redirectUri: "http://127.0.0.1:1234/",
      state: "S",
      pkceChallenge: "C",
    });
    const u = new URL(url);
    expect(u.searchParams.get("access_type")).toBe("offline");
    expect(u.searchParams.get("prompt")).toBe("consent");
    expect(u.searchParams.get("include_granted_scopes")).toBe("true");
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
  });

  it("googleProviderForScopes narrows the scope set without losing config", () => {
    const ga4Only = googleProviderForScopes([GOOGLE_SCOPES.ga4Read]);
    expect(ga4Only.scopes).toEqual([GOOGLE_SCOPES.ga4Read]);
    expect(ga4Only.usePkce).toBe(true);
    expect(ga4Only.extraAuthorizeParams).toEqual(
      GOOGLE_PROVIDER_FULL.extraAuthorizeParams,
    );
  });

  describe("refreshGoogleAccessToken", () => {
    it("posts to the token endpoint with grant_type=refresh_token", async () => {
      let capturedUrl = "";
      let capturedBody = "";
      const fetchImpl = async (url: string, init?: RequestInit) => {
        capturedUrl = url;
        capturedBody = String(init?.body ?? "");
        return new Response(
          JSON.stringify({
            access_token: "ACCESS",
            expires_in: 3600,
            token_type: "Bearer",
            scope: GOOGLE_SCOPES.ads,
          }),
          { status: 200 },
        );
      };
      const tokens = await refreshGoogleAccessToken(
        { client_id: "c", client_secret: "s" },
        "REFRESH",
        fetchImpl,
      );
      expect(tokens.access_token).toBe("ACCESS");
      expect(tokens.token_type).toBe("Bearer");
      expect(tokens.expires_at).toBeGreaterThan(Date.now());
      expect(capturedUrl).toBe("https://oauth2.googleapis.com/token");
      expect(capturedBody).toContain("grant_type=refresh_token");
      expect(capturedBody).toContain("refresh_token=REFRESH");
    });

    it("throws when client_secret is missing", async () => {
      await expect(
        refreshGoogleAccessToken(
          { client_id: "c" },
          "R",
          async () => new Response("{}"),
        ),
      ).rejects.toThrow(/client_secret/);
    });

    it("propagates non-2xx responses", async () => {
      const fetchImpl = async () =>
        new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 });
      await expect(
        refreshGoogleAccessToken(
          { client_id: "c", client_secret: "s" },
          "BAD",
          fetchImpl,
        ),
      ).rejects.toThrow(/Google token refresh failed \(400\)/);
    });
  });
});
