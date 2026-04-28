import { SecretsManager } from "./SecretsManager.js";
import type { SecretRef } from "./types.js";

const TOKEN_URL = "https://oauth2.googleapis.com/token";

interface AuthorizedUserCreds {
  type: "authorized_user";
  client_id: string;
  client_secret: string;
  refresh_token: string;
}

export type GoogleFetchLike = (input: string, init?: RequestInit) => Promise<Response>;

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

/**
 * Shared Google OAuth 2.0 access-token manager. Reusable across Google Ads,
 * GA4, and GSC since all three accept tokens minted from the same
 * `authorized_user` credentials.json shape.
 *
 * Keep one instance per (account, platform) pair; the cache is in-memory and
 * scoped to that instance.
 */
export class GoogleOAuth {
  private cache: CachedToken | null = null;

  constructor(
    private readonly credentialsRef: SecretRef,
    private readonly accountLabel: string,
    private readonly fetchImpl: GoogleFetchLike = globalThis.fetch.bind(globalThis),
    private readonly now: () => number = () => Date.now(),
  ) {}

  async getAccessToken(): Promise<string> {
    const cached = this.cache;
    if (cached && this.now() < cached.expiresAt - 30_000) {
      return cached.accessToken;
    }
    const fresh = await this.refresh();
    this.cache = fresh;
    return fresh.accessToken;
  }

  private async refresh(): Promise<CachedToken> {
    const credsJson = await SecretsManager.resolve(this.credentialsRef);
    let creds: AuthorizedUserCreds;
    try {
      creds = JSON.parse(credsJson) as AuthorizedUserCreds;
    } catch (err) {
      throw new Error(
        `Google OAuth credentials for account '${this.accountLabel}' are not valid JSON: ${(err as Error).message}`,
      );
    }
    if (creds.type !== "authorized_user") {
      throw new Error(
        `Google OAuth credentials for '${this.accountLabel}': expected type 'authorized_user', got '${creds.type ?? "<missing>"}'.`,
      );
    }

    const body = new URLSearchParams({
      client_id: creds.client_id,
      client_secret: creds.client_secret,
      refresh_token: creds.refresh_token,
      grant_type: "refresh_token",
    });

    const res = await this.fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Google OAuth refresh failed (${res.status}): ${text.slice(0, 300)}`);
    }
    const parsed = JSON.parse(text) as { access_token?: string; expires_in?: number };
    if (!parsed.access_token || typeof parsed.expires_in !== "number") {
      throw new Error(`Google OAuth refresh returned unexpected shape: ${text.slice(0, 200)}`);
    }
    return {
      accessToken: parsed.access_token,
      expiresAt: this.now() + parsed.expires_in * 1000,
    };
  }
}
