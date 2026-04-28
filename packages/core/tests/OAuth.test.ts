import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  OAuthProviderError,
  OAuthStateMismatchError,
  OAuthTokenExchangeError,
  buildAuthorizeUrl,
  generatePkcePair,
  generateState,
  runOAuthFlow,
} from "../src/OAuth/index.js";
import type { OAuthProvider } from "../src/OAuth/types.js";

const fakeProvider: OAuthProvider = {
  name: "fakeprovider",
  authorizeUrl: "https://auth.fakeprovider.test/authorize",
  tokenUrl: "https://auth.fakeprovider.test/token",
  scopes: ["read", "write"],
  usePkce: true,
  issuesRefreshToken: true,
  extraAuthorizeParams: { access_type: "offline" },
};

describe("OAuth — PKCE", () => {
  it("verifier is between 43 and 128 characters and URL-safe", () => {
    const pair = generatePkcePair();
    expect(pair.verifier.length).toBeGreaterThanOrEqual(43);
    expect(pair.verifier.length).toBeLessThanOrEqual(128);
    expect(pair.verifier).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("challenge is BASE64URL(SHA256(verifier))", () => {
    const pair = generatePkcePair();
    const expected = createHash("sha256")
      .update(pair.verifier)
      .digest("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
    expect(pair.challenge).toBe(expected);
    expect(pair.method).toBe("S256");
  });

  it("each call returns fresh randomness", () => {
    const a = generatePkcePair();
    const b = generatePkcePair();
    expect(a.verifier).not.toBe(b.verifier);
  });

  it("generateState returns URL-safe random strings", () => {
    const s1 = generateState();
    const s2 = generateState();
    expect(s1).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(s1).not.toBe(s2);
  });
});

describe("OAuth — buildAuthorizeUrl", () => {
  it("includes core params and the provider's extra params", () => {
    const url = buildAuthorizeUrl({
      provider: fakeProvider,
      clientId: "abc123",
      redirectUri: "http://127.0.0.1:54321/",
      state: "STATE",
      pkceChallenge: "CHALLENGE",
    });
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe(
      "https://auth.fakeprovider.test/authorize",
    );
    expect(u.searchParams.get("response_type")).toBe("code");
    expect(u.searchParams.get("client_id")).toBe("abc123");
    expect(u.searchParams.get("redirect_uri")).toBe("http://127.0.0.1:54321/");
    expect(u.searchParams.get("state")).toBe("STATE");
    expect(u.searchParams.get("scope")).toBe("read write");
    expect(u.searchParams.get("code_challenge")).toBe("CHALLENGE");
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("access_type")).toBe("offline");
  });

  it("omits PKCE params when provider.usePkce is false", () => {
    const url = buildAuthorizeUrl({
      provider: { ...fakeProvider, usePkce: false },
      clientId: "abc",
      redirectUri: "http://127.0.0.1:1/",
      state: "S",
    });
    const u = new URL(url);
    expect(u.searchParams.get("code_challenge")).toBeNull();
    expect(u.searchParams.get("code_challenge_method")).toBeNull();
  });
});

describe("OAuth — runOAuthFlow", () => {
  it("happy path: hits the loopback redirect, exchanges code, returns tokens", async () => {
    let authorizeUrl = "";
    const fetchImpl = async (url: string, init?: RequestInit) => {
      // Verify the token-exchange request looks correct.
      expect(url).toBe(fakeProvider.tokenUrl);
      const body = new URLSearchParams(init?.body as string);
      expect(body.get("grant_type")).toBe("authorization_code");
      expect(body.get("code")).toBe("AUTHCODE");
      expect(body.get("client_id")).toBe("client-xyz");
      expect(body.get("client_secret")).toBe("shh");
      expect(body.get("code_verifier")).toMatch(/^[A-Za-z0-9_-]+$/);
      return new Response(
        JSON.stringify({
          access_token: "ACCESS",
          refresh_token: "REFRESH",
          expires_in: 3600,
          token_type: "Bearer",
          scope: "read write",
        }),
        { status: 200 },
      );
    };

    const flow = runOAuthFlow(
      {
        provider: fakeProvider,
        credentials: { client_id: "client-xyz", client_secret: "shh" },
        redirectUri: "http://127.0.0.1:{PORT}/",
        timeoutMs: 5_000,
        onAuthorizeUrl: (url) => {
          authorizeUrl = url;
        },
      },
      fetchImpl,
    );

    // Wait until the local server has the URL ready, then simulate the
    // browser redirect by hitting it ourselves.
    await waitFor(() => authorizeUrl !== "");
    const u = new URL(authorizeUrl);
    const state = u.searchParams.get("state")!;
    const port = Number(
      new URL(u.searchParams.get("redirect_uri")!).port || "80",
    );
    const cbRes = await fetch(
      `http://127.0.0.1:${port}/?code=AUTHCODE&state=${encodeURIComponent(state)}`,
    );
    expect(cbRes.status).toBe(200);
    const html = await cbRes.text();
    expect(html).toContain("authorized");

    const tokens = await flow;
    expect(tokens.access_token).toBe("ACCESS");
    expect(tokens.refresh_token).toBe("REFRESH");
    expect(tokens.expires_at).toBeGreaterThan(Date.now());
    expect(tokens.token_type).toBe("Bearer");
    expect(tokens.scope).toBe("read write");
  });

  it("rejects when state on the callback doesn't match", async () => {
    let authorizeUrl = "";
    const fetchImpl = async () =>
      new Response('{"access_token":"x"}', { status: 200 });
    const flow = runOAuthFlow(
      {
        provider: fakeProvider,
        credentials: { client_id: "c", client_secret: "s" },
        redirectUri: "http://127.0.0.1:{PORT}/",
        timeoutMs: 5_000,
        onAuthorizeUrl: (url) => {
          authorizeUrl = url;
        },
      },
      fetchImpl,
    );
    // Attach the rejection assertion immediately to avoid an
    // unhandled-rejection warning if the flow rejects before we await.
    const assertion = expect(flow).rejects.toBeInstanceOf(
      OAuthStateMismatchError,
    );
    await waitFor(() => authorizeUrl !== "");
    const port = Number(
      new URL(
        new URL(authorizeUrl).searchParams.get("redirect_uri")!,
      ).port || "80",
    );
    await fetch(`http://127.0.0.1:${port}/?code=AUTHCODE&state=WRONGSTATE`);
    await assertion;
  });

  it("propagates a provider ?error=... response", async () => {
    let authorizeUrl = "";
    const flow = runOAuthFlow(
      {
        provider: fakeProvider,
        credentials: { client_id: "c", client_secret: "s" },
        redirectUri: "http://127.0.0.1:{PORT}/",
        timeoutMs: 5_000,
        onAuthorizeUrl: (url) => {
          authorizeUrl = url;
        },
      },
      async () => new Response("", { status: 200 }),
    );
    const assertion = expect(flow).rejects.toBeInstanceOf(OAuthProviderError);
    await waitFor(() => authorizeUrl !== "");
    const port = Number(
      new URL(
        new URL(authorizeUrl).searchParams.get("redirect_uri")!,
      ).port || "80",
    );
    await fetch(
      `http://127.0.0.1:${port}/?error=access_denied&error_description=user%20said%20no`,
    );
    await assertion;
  });

  it("throws OAuthTokenExchangeError on a non-2xx token response", async () => {
    let authorizeUrl = "";
    const fetchImpl = async () =>
      new Response('{"error":"invalid_grant"}', { status: 400 });
    const flow = runOAuthFlow(
      {
        provider: fakeProvider,
        credentials: { client_id: "c", client_secret: "s" },
        redirectUri: "http://127.0.0.1:{PORT}/",
        timeoutMs: 5_000,
        onAuthorizeUrl: (url) => {
          authorizeUrl = url;
        },
      },
      fetchImpl,
    );
    const assertion = expect(flow).rejects.toBeInstanceOf(
      OAuthTokenExchangeError,
    );
    await waitFor(() => authorizeUrl !== "");
    const u = new URL(authorizeUrl);
    const state = u.searchParams.get("state")!;
    const port = Number(
      new URL(u.searchParams.get("redirect_uri")!).port || "80",
    );
    await fetch(
      `http://127.0.0.1:${port}/?code=AUTHCODE&state=${encodeURIComponent(state)}`,
    );
    await assertion;
  });
});

// --- helpers ---------------------------------------------------------------

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 2_000,
): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("waitFor: predicate never became true");
    }
    await new Promise((r) => setTimeout(r, 10));
  }
}
