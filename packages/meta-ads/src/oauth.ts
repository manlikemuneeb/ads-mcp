import {
  type OAuthClientCredentials,
  type OAuthProvider,
  type OAuthTokens,
  runOAuthFlow,
} from "@manlikemuneeb/ads-mcp-core";

/**
 * Meta (Facebook / Instagram) OAuth 2.0 provider config.
 *
 * Notes:
 *   - PKCE: Meta's OAuth doc doesn't document PKCE for server-side flows,
 *     so we omit it and rely on client_secret. (Meta supports PKCE for
 *     mobile/SPA clients, but for our server-side wizard the secret is
 *     present anyway.)
 *   - Refresh tokens: Meta does NOT issue refresh tokens. After the
 *     authorization-code exchange we get a short-lived access token
 *     (~1-2 hours). We then upgrade it to a long-lived (~60-day) token
 *     via a separate "fb_exchange_token" grant. That long-lived token
 *     is what we store in the keychain.
 *   - When the long-lived token nears expiry, the user must re-run the
 *     wizard. Meta does not offer programmatic refresh.
 *
 * Required app permissions (configured in the Meta App Dashboard):
 *   ads_read           — read insights, account, campaign, ad data
 *   ads_management     — pause/resume/budget edits
 *   business_management— required when accessing business-owned accounts
 */

const META_GRAPH_VERSION = "v25.0"; // Match Meta API version used in MetaClient.

export const META_PROVIDER: OAuthProvider = {
  name: "meta",
  authorizeUrl: `https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth`,
  tokenUrl: `https://graph.facebook.com/${META_GRAPH_VERSION}/oauth/access_token`,
  scopes: ["ads_read", "ads_management", "business_management"],
  usePkce: false,
  issuesRefreshToken: false,
};

interface MetaOAuthInput {
  credentials: OAuthClientCredentials;
  /**
   * Redirect URI registered in your Meta App's OAuth settings. Must match
   * exactly. Use "http://127.0.0.1:{PORT}/" if you registered the app with
   * "http://localhost" — but Meta requires HTTPS for non-localhost URIs.
   */
  redirectUri?: string;
  /** Local TCP port the wizard listens on. */
  localPort?: number;
  /** Hook to open the authorize URL (CLI default: prints to stderr). */
  onAuthorizeUrl?: (url: string) => Promise<void> | void;
}

/**
 * Runs the full Meta OAuth flow AND upgrades the resulting short-lived
 * access token to a long-lived (~60-day) one. Returns the long-lived
 * tokens with `expires_at` set so the caller can warn the user when
 * a refresh is due.
 */
export async function runMetaOAuthFlow(
  input: MetaOAuthInput,
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response> = (
    globalThis.fetch as typeof fetch
  ).bind(globalThis),
): Promise<OAuthTokens> {
  const flowInput = {
    provider: META_PROVIDER,
    credentials: input.credentials,
    redirectUri: input.redirectUri ?? "http://127.0.0.1:{PORT}/",
    ...(input.localPort !== undefined ? { localPort: input.localPort } : {}),
    ...(input.onAuthorizeUrl ? { onAuthorizeUrl: input.onAuthorizeUrl } : {}),
  };
  const shortLived = await runOAuthFlow(flowInput, fetchImpl);
  return upgradeMetaToken(input.credentials, shortLived.access_token, fetchImpl);
}

/**
 * Exchanges a short-lived Meta user access token for a long-lived (~60-day)
 * one via the fb_exchange_token grant. Idempotent — if you pass an already-
 * long-lived token, Meta returns a fresh long-lived token.
 */
export async function upgradeMetaToken(
  credentials: OAuthClientCredentials,
  shortLivedToken: string,
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response> = (
    globalThis.fetch as typeof fetch
  ).bind(globalThis),
): Promise<OAuthTokens> {
  if (!credentials.client_secret) {
    throw new Error(
      "Meta long-lived token exchange requires client_secret",
    );
  }
  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: credentials.client_id,
    client_secret: credentials.client_secret,
    fb_exchange_token: shortLivedToken,
  });
  const url = `https://graph.facebook.com/${META_GRAPH_VERSION}/oauth/access_token?${params.toString()}`;
  const res = await fetchImpl(url, { method: "GET" });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `Meta long-lived token exchange failed (${res.status}): ${text.slice(0, 400)}`,
    );
  }
  let parsed: { access_token?: string; expires_in?: number; token_type?: string };
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(
      `Meta long-lived exchange returned non-JSON: ${(err as Error).message}; body: ${text.slice(0, 200)}`,
    );
  }
  if (typeof parsed.access_token !== "string" || parsed.access_token === "") {
    throw new Error(
      `Meta long-lived exchange response missing access_token: ${text.slice(0, 200)}`,
    );
  }
  const tokens: OAuthTokens = { access_token: parsed.access_token };
  if (typeof parsed.expires_in === "number") {
    tokens.expires_at = Date.now() + parsed.expires_in * 1000;
  }
  if (typeof parsed.token_type === "string") tokens.token_type = parsed.token_type;
  return tokens;
}
