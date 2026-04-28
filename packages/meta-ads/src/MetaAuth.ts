import { type MetaAccount, SecretsManager } from "@manlikemuneeb/ads-mcp-core";
import { META_GRAPH_BASE_URL } from "./version.js";

export interface RefreshResult {
  access_token: string;
  expires_in: number;
  token_type: string;
}

/**
 * Exchange a (possibly short-lived) Meta user token for a long-lived one.
 *
 * Endpoint: POST /{version}/oauth/access_token
 * Body: grant_type=fb_exchange_token, client_id, client_secret, fb_exchange_token
 *
 * Meta's docs: https://developers.facebook.com/docs/facebook-login/access-tokens/refreshing
 *
 * Long-lived user tokens last ~60 days. Run this proactively at 80% of TTL,
 * not on demand from a tool call. The setup wizard wires this on a schedule.
 */
export async function refreshLongLivedToken(
  account: MetaAccount,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch.bind(globalThis),
): Promise<RefreshResult> {
  if (!account.app_id_ref || !account.app_secret_ref) {
    throw new Error(
      `Cannot refresh token for account '${account.label}': app_id_ref and app_secret_ref must both be set in config.`,
    );
  }

  const [token, appId, appSecret] = await Promise.all([
    SecretsManager.resolve(account.token_ref),
    SecretsManager.resolve(account.app_id_ref),
    SecretsManager.resolve(account.app_secret_ref),
  ]);

  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: token,
  });

  const url = `${META_GRAPH_BASE_URL}/oauth/access_token?${params.toString()}`;
  const res = await fetchImpl(url, { method: "GET" });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Meta token refresh failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const parsed = JSON.parse(text) as Partial<RefreshResult>;
  if (!parsed.access_token || typeof parsed.expires_in !== "number") {
    throw new Error(`Meta token refresh returned unexpected shape: ${text.slice(0, 300)}`);
  }
  return parsed as RefreshResult;
}
