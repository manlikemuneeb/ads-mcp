import type { AuditLogger } from "./AuditLogger.js";
import { KeychainStore } from "./KeychainStore.js";
import { SecretsManager } from "./SecretsManager.js";
import type { OAuthClientCredentials, OAuthTokens } from "./OAuth/types.js";
import type { PlatformName, SecretRef } from "./types.js";

/**
 * Refresh callback contract — each platform supplies its own refresh function
 * (LinkedIn refreshLinkedInAccessToken, Google refreshGoogleAccessToken, etc.)
 * so TokenManager stays platform-agnostic.
 *
 * Returns OAuthTokens. If the provider rotates refresh tokens (LinkedIn does
 * this occasionally, Google does not), the new refresh_token is included
 * and TokenManager re-stores it to the keychain entry.
 */
export type RefreshFn = (
  credentials: OAuthClientCredentials,
  refreshToken: string,
) => Promise<OAuthTokens>;

interface CachedAccessToken {
  accessToken: string;
  /** Unix epoch ms; undefined when the provider didn't share expiry. */
  expiresAt?: number;
}

interface TokenManagerInput {
  platform: PlatformName;
  accountLabel: string;
  /**
   * Reference to the refresh token. Almost always a kind:"keychain" ref
   * written by the OAuth wizard. kind:"inline" / "env" / "file" also work
   * (read-only — TokenManager won't try to write back through them).
   */
  refreshTokenRef: SecretRef;
  /**
   * Reference to the OAuth app's client_id. For most platforms this is fine
   * inline since client_id is not a secret. For Google it's part of the
   * OAuth credentials JSON; callers can use kind:"inline" with just the id.
   */
  clientIdRef: SecretRef;
  /** Reference to the OAuth app's client_secret. */
  clientSecretRef: SecretRef;
  /** Platform-specific refresh callback. */
  refreshFn: RefreshFn;
  /** Optional audit logger; when present, every refresh is logged. */
  auditLogger?: AuditLogger;
}

/**
 * Manages access-token lifecycle for one (platform, account) pair.
 *
 * - Caches the access token in memory until it's within 60 seconds of expiry.
 * - On expiry, calls the platform's refreshFn with the stored refresh token.
 * - If the provider rotates the refresh token, persists the new one back to
 *   the same keychain entry so the next session reads the latest.
 * - Logs every refresh to the AuditLogger so users can see when their tokens
 *   were rotated.
 *
 * Construct one per (platform, account) pair and reuse it across the life
 * of the MCP server process.
 */
export class TokenManager {
  private cached: CachedAccessToken | null = null;

  constructor(private readonly input: TokenManagerInput) {}

  /**
   * Returns a fresh access token, refreshing it if necessary.
   * Concurrent callers share one in-flight refresh.
   */
  async getAccessToken(): Promise<string> {
    if (this.cached && this.isStillFresh(this.cached)) {
      return this.cached.accessToken;
    }
    if (!this.refreshing) {
      this.refreshing = this.refresh();
    }
    try {
      const next = await this.refreshing;
      this.cached = next;
      return next.accessToken;
    } finally {
      this.refreshing = null;
    }
  }

  /**
   * Force the next call to refresh, even if the cached token looks fresh.
   * Use when the platform returns 401: maybe the token was revoked early.
   */
  invalidate(): void {
    this.cached = null;
  }

  // --- internals ----------------------------------------------------------

  private refreshing: Promise<CachedAccessToken> | null = null;

  private isStillFresh(t: CachedAccessToken): boolean {
    if (t.expiresAt === undefined) return true; // Provider didn't tell us; trust until proven wrong.
    return Date.now() < t.expiresAt - 60_000;
  }

  private async refresh(): Promise<CachedAccessToken> {
    const [refreshToken, clientId, clientSecret] = await Promise.all([
      SecretsManager.resolve(this.input.refreshTokenRef),
      SecretsManager.resolve(this.input.clientIdRef),
      SecretsManager.resolve(this.input.clientSecretRef),
    ]);
    const tokens = await this.input.refreshFn(
      { client_id: clientId, client_secret: clientSecret },
      refreshToken,
    );

    // If the provider rotated the refresh token AND we're storing it in the
    // keychain (the only writable backend), persist the rotation so the next
    // ads-mcp run picks up the latest.
    if (
      tokens.refresh_token &&
      tokens.refresh_token !== refreshToken &&
      this.input.refreshTokenRef.kind === "keychain"
    ) {
      await KeychainStore.set(
        this.input.refreshTokenRef.service,
        this.input.refreshTokenRef.key,
        tokens.refresh_token,
      );
      // Bust the resolution cache so the next read sees the new value.
      SecretsManager.clearCache();
    }

    if (this.input.auditLogger) {
      await this.input.auditLogger.log({
        platform: this.input.platform,
        account: this.input.accountLabel,
        tool: "token.refresh",
        outcome: "live_success",
        params: {},
        dry_run: false,
        result_summary: tokens.expires_at
          ? `expires_at=${new Date(tokens.expires_at).toISOString()}`
          : "no_expiry",
      });
    }

    const result: CachedAccessToken = { accessToken: tokens.access_token };
    if (tokens.expires_at !== undefined) result.expiresAt = tokens.expires_at;
    return result;
  }
}
