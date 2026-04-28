import {
  type OAuthClientCredentials,
  type OAuthFlowInput,
  type OAuthProvider,
  type OAuthTokens,
  runOAuthFlow,
} from "@manlikemuneeb/ads-mcp-core";

/**
 * LinkedIn Marketing API OAuth 2.0 provider config.
 *
 * Notes:
 *   - PKCE: DISABLED. LinkedIn supports two distinct OAuth flows:
 *       Standard / Web app   → uses client_secret, NO PKCE
 *       Native / Mobile app  → uses PKCE, NO client_secret
 *     Marketing API access is always registered as Standard/Web, so we
 *     send client_secret without PKCE. Sending both (which the wizard
 *     was doing in earlier versions) produced HTTP 401 invalid_client
 *     from /oauth/v2/accessToken.
 *   - Refresh tokens: LinkedIn issues 365-day refresh tokens AND 60-day
 *     access tokens. The refresh token is what we store; access tokens
 *     are minted on demand.
 *   - rw_ads scope requires Marketing Developer Platform partner approval.
 *     Apps without partner status will see authorize errors when rw_ads
 *     is requested. The wizard offers read-only as a fallback.
 *
 * Required app permissions (configured in the LinkedIn Developer Portal,
 * "Products" tab):
 *   r_ads             — read campaigns, creatives, account info
 *   r_ads_reporting   — read /adAnalytics responses
 *   rw_ads            — pause/resume/budget edits (partner-gated)
 */

export const LINKEDIN_PROVIDER: OAuthProvider = {
  name: "linkedin",
  authorizeUrl: "https://www.linkedin.com/oauth/v2/authorization",
  tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
  scopes: ["r_ads", "r_ads_reporting", "rw_ads"],
  usePkce: false,
  issuesRefreshToken: true,
};

/**
 * Read-only variant — request when rw_ads is unavailable. Same provider
 * config but without the rw_ads scope.
 */
export const LINKEDIN_PROVIDER_READ_ONLY: OAuthProvider = {
  ...LINKEDIN_PROVIDER,
  scopes: ["r_ads", "r_ads_reporting"],
};

interface LinkedInOAuthInput {
  credentials: OAuthClientCredentials;
  /**
   * Redirect URI registered in your LinkedIn App's OAuth settings. LinkedIn
   * accepts http://127.0.0.1:<port>/ for development apps.
   */
  redirectUri?: string;
  localPort?: number;
  onAuthorizeUrl?: (url: string) => Promise<void> | void;
  /**
   * Whether to request rw_ads (write scope). Defaults to true. Set false
   * when your app doesn't have Marketing Developer Platform approval.
   */
  enableWrites?: boolean;
}

export async function runLinkedInOAuthFlow(
  input: LinkedInOAuthInput,
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response> = (
    globalThis.fetch as typeof fetch
  ).bind(globalThis),
): Promise<OAuthTokens> {
  const enableWrites = input.enableWrites ?? true;
  const flowInput: OAuthFlowInput = {
    provider: enableWrites ? LINKEDIN_PROVIDER : LINKEDIN_PROVIDER_READ_ONLY,
    credentials: input.credentials,
    redirectUri: input.redirectUri ?? "http://127.0.0.1:{PORT}/",
    ...(input.localPort !== undefined ? { localPort: input.localPort } : {}),
    ...(input.onAuthorizeUrl ? { onAuthorizeUrl: input.onAuthorizeUrl } : {}),
  };
  return runOAuthFlow(flowInput, fetchImpl);
}

/**
 * Refreshes a LinkedIn access token using a stored refresh token.
 * Returns a fresh access token (and possibly a new refresh token — LinkedIn
 * does sometimes rotate them). Caller should re-store the refresh_token
 * if it changed.
 */
export async function refreshLinkedInAccessToken(
  credentials: OAuthClientCredentials,
  refreshToken: string,
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response> = (
    globalThis.fetch as typeof fetch
  ).bind(globalThis),
): Promise<OAuthTokens> {
  if (!credentials.client_secret) {
    throw new Error("LinkedIn token refresh requires client_secret");
  }
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: credentials.client_id,
    client_secret: credentials.client_secret,
  });
  const res = await fetchImpl(LINKEDIN_PROVIDER.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `LinkedIn token refresh failed (${res.status}): ${text.slice(0, 400)}`,
    );
  }
  let parsed: {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    refresh_token_expires_in?: number;
    scope?: string;
  };
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(
      `LinkedIn refresh returned non-JSON: ${(err as Error).message}; body: ${text.slice(0, 200)}`,
    );
  }
  if (typeof parsed.access_token !== "string" || parsed.access_token === "") {
    throw new Error(
      `LinkedIn refresh response missing access_token: ${text.slice(0, 200)}`,
    );
  }
  const tokens: OAuthTokens = { access_token: parsed.access_token };
  if (typeof parsed.refresh_token === "string") {
    tokens.refresh_token = parsed.refresh_token;
  }
  if (typeof parsed.expires_in === "number") {
    tokens.expires_at = Date.now() + parsed.expires_in * 1000;
  }
  if (typeof parsed.scope === "string") tokens.scope = parsed.scope;
  return tokens;
}
