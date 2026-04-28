import { type LinkedInAccount, SecretsManager } from "@manlikemuneeb/ads-mcp-core";

const TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";

export interface RefreshResult {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  scope?: string;
  token_type: string;
}

/**
 * Exchange a LinkedIn refresh token for a new access token.
 *
 * Endpoint: POST https://www.linkedin.com/oauth/v2/accessToken
 * Body (form-urlencoded):
 *   grant_type=refresh_token, refresh_token, client_id, client_secret
 *
 * Access tokens last ~1 hour; refresh tokens roughly 60 days. Run proactively.
 */
export async function refreshAccessToken(
  account: LinkedInAccount,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch.bind(globalThis),
): Promise<RefreshResult> {
  if (!account.refresh_token_ref || !account.client_id_ref || !account.client_secret_ref) {
    throw new Error(
      `Cannot refresh LinkedIn token for '${account.label}': refresh_token_ref, client_id_ref, and client_secret_ref must all be configured.`,
    );
  }

  const [refreshToken, clientId, clientSecret] = await Promise.all([
    SecretsManager.resolve(account.refresh_token_ref),
    SecretsManager.resolve(account.client_id_ref),
    SecretsManager.resolve(account.client_secret_ref),
  ]);

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`LinkedIn token refresh failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const parsed = JSON.parse(text) as Partial<RefreshResult>;
  if (!parsed.access_token || typeof parsed.expires_in !== "number") {
    throw new Error(`LinkedIn token refresh returned unexpected shape: ${text.slice(0, 300)}`);
  }
  return parsed as RefreshResult;
}
