import { runOAuthFlow } from "./flow.js";
import type {
  OAuthClientCredentials,
  OAuthFlowInput,
  OAuthProvider,
  OAuthTokens,
} from "./types.js";

/**
 * Google OAuth 2.0 provider config — shared by Google Ads, GA4, and GSC.
 *
 * The three Google products use the same OAuth substrate (one consent screen,
 * one refresh token, multiple scopes). We pull all the scopes a typical
 * marketer needs in one go so the wizard runs once per Google identity.
 *
 * Notes:
 *   - PKCE: enabled.
 *   - access_type=offline + prompt=consent forces Google to issue a refresh
 *     token even if the user has previously authorized the app. Without
 *     prompt=consent, Google omits refresh_token on subsequent grants and
 *     the wizard appears to "succeed" but never gets a refreshable token.
 *   - Scopes (full list, opt-out per-product):
 *       https://www.googleapis.com/auth/adwords          (Google Ads)
 *       https://www.googleapis.com/auth/analytics.readonly (GA4 read)
 *       https://www.googleapis.com/auth/analytics.edit     (GA4 admin/write)
 *       https://www.googleapis.com/auth/webmasters         (GSC read+write)
 */

export const GOOGLE_SCOPES = {
  ads: "https://www.googleapis.com/auth/adwords",
  ga4Read: "https://www.googleapis.com/auth/analytics.readonly",
  ga4Edit: "https://www.googleapis.com/auth/analytics.edit",
  gsc: "https://www.googleapis.com/auth/webmasters",
} as const;

export const GOOGLE_PROVIDER_FULL: OAuthProvider = {
  name: "google",
  authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenUrl: "https://oauth2.googleapis.com/token",
  scopes: [
    GOOGLE_SCOPES.ads,
    GOOGLE_SCOPES.ga4Read,
    GOOGLE_SCOPES.ga4Edit,
    GOOGLE_SCOPES.gsc,
  ],
  usePkce: true,
  issuesRefreshToken: true,
  extraAuthorizeParams: {
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
  },
};

/** Builder for a custom Google scope set. Use when you only need a subset. */
export function googleProviderForScopes(scopes: string[]): OAuthProvider {
  return { ...GOOGLE_PROVIDER_FULL, scopes };
}

interface GoogleOAuthInput {
  credentials: OAuthClientCredentials;
  /** Scopes to request. Default: all four (ads, ga4 read+edit, gsc). */
  scopes?: string[];
  /** Redirect URI registered in your Google Cloud OAuth client. */
  redirectUri?: string;
  localPort?: number;
  onAuthorizeUrl?: (url: string) => Promise<void> | void;
}

export async function runGoogleOAuthFlow(
  input: GoogleOAuthInput,
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response> = (
    globalThis.fetch as typeof fetch
  ).bind(globalThis),
): Promise<OAuthTokens> {
  const provider = input.scopes
    ? googleProviderForScopes(input.scopes)
    : GOOGLE_PROVIDER_FULL;
  const flowInput: OAuthFlowInput = {
    provider,
    credentials: input.credentials,
    redirectUri: input.redirectUri ?? "http://127.0.0.1:{PORT}/",
    ...(input.localPort !== undefined ? { localPort: input.localPort } : {}),
    ...(input.onAuthorizeUrl ? { onAuthorizeUrl: input.onAuthorizeUrl } : {}),
  };
  return runOAuthFlow(flowInput, fetchImpl);
}

/**
 * Refreshes a Google access token using a stored refresh token.
 * Google refresh tokens are long-lived and not normally rotated.
 */
export async function refreshGoogleAccessToken(
  credentials: OAuthClientCredentials,
  refreshToken: string,
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response> = (
    globalThis.fetch as typeof fetch
  ).bind(globalThis),
): Promise<OAuthTokens> {
  if (!credentials.client_secret) {
    throw new Error("Google token refresh requires client_secret");
  }
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: credentials.client_id,
    client_secret: credentials.client_secret,
  });
  const res = await fetchImpl(GOOGLE_PROVIDER_FULL.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `Google token refresh failed (${res.status}): ${text.slice(0, 400)}`,
    );
  }
  let parsed: {
    access_token?: string;
    expires_in?: number;
    scope?: string;
    token_type?: string;
  };
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(
      `Google refresh returned non-JSON: ${(err as Error).message}; body: ${text.slice(0, 200)}`,
    );
  }
  if (typeof parsed.access_token !== "string" || parsed.access_token === "") {
    throw new Error(
      `Google refresh response missing access_token: ${text.slice(0, 200)}`,
    );
  }
  const tokens: OAuthTokens = { access_token: parsed.access_token };
  if (typeof parsed.expires_in === "number") {
    tokens.expires_at = Date.now() + parsed.expires_in * 1000;
  }
  if (typeof parsed.scope === "string") tokens.scope = parsed.scope;
  if (typeof parsed.token_type === "string") tokens.token_type = parsed.token_type;
  return tokens;
}
