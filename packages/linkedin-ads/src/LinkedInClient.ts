import {
  type AuditLogger,
  type LinkedInAccount,
  type RateLimiter,
  RateLimitedError,
  SecretsManager,
  TokenManager,
} from "@manlikemuneeb/ads-mcp-core";
import { refreshLinkedInAccessToken } from "./oauth.js";
import { LINKEDIN_BASE_HEADERS, LINKEDIN_BASE_URL } from "./version.js";

export interface LinkedInApiError extends Error {
  status: number;
  serviceErrorCode?: number;
  liMessage?: string;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Thin HTTP client over LinkedIn's Marketing /rest/ API.
 *
 * Handles:
 *   - Bearer token via Authorization header
 *   - LinkedIn-Version + X-Restli-Protocol-Version on every call
 *   - PARTIAL_UPDATE method for PATCH-style mutations
 *   - Rate-limit acquire before every call
 *   - Error parsing of LinkedIn's `{message, status, serviceErrorCode}` shape
 *
 * Drops:
 *   - The old plugin's v2 fallback paths. /rest/ is canonical now.
 *   - Token in URL query (LinkedIn never accepted that anyway).
 */
export class LinkedInClient {
  private readonly tokenManager: TokenManager | null;

  constructor(
    private readonly account: LinkedInAccount,
    private readonly rateLimiter: RateLimiter,
    private readonly fetchImpl: FetchLike = globalThis.fetch.bind(globalThis),
    private readonly auditLogger?: AuditLogger,
  ) {
    this.tokenManager = buildTokenManager(account, fetchImpl, auditLogger);
  }

  getAccountId(): string {
    return this.account.ad_account_id;
  }

  /** Whether this client refreshes its access token automatically. */
  hasAutoRefresh(): boolean {
    return this.tokenManager !== null;
  }

  async get(path: string, query: Record<string, string | number | undefined> = {}): Promise<unknown> {
    return this.request("GET", path, query, undefined, {});
  }

  async post(path: string, body: Record<string, unknown> = {}): Promise<unknown> {
    return this.request("POST", path, {}, body, {});
  }

  /**
   * PARTIAL_UPDATE on a single resource. LinkedIn requires the special header
   * `X-RestLi-Method: PARTIAL_UPDATE` and a body shaped like
   * `{patch: {$set: {field: value, ...}}}`.
   */
  async partialUpdate(path: string, set: Record<string, unknown>): Promise<unknown> {
    return this.request(
      "POST",
      path,
      {},
      { patch: { $set: set } },
      { "X-RestLi-Method": "PARTIAL_UPDATE" },
    );
  }

  private async request(
    method: "GET" | "POST" | "DELETE",
    path: string,
    query: Record<string, string | number | undefined>,
    body: Record<string, unknown> | undefined,
    extraHeaders: Record<string, string>,
    isRetry = false,
  ): Promise<unknown> {
    this.rateLimiter.acquire("linkedin");

    const token = this.tokenManager
      ? await this.tokenManager.getAccessToken()
      : await SecretsManager.resolve(this.account.token_ref);
    // Build URL manually. LinkedIn's Rest.li 2.0 protocol distinguishes
    // structural chars (raw `, : ( ) [ ] .`) from data chars (escaped) at the
    // raw URL level — generic URL-decoding loses that distinction. Callers
    // pass values that already contain the right mix of raw and `%XX` escapes
    // (e.g. URN colons are literal `%3A` inside an inline complex value, raw
    // `:` in a top-level URN value). Our job: don't double-encode anything
    // and only escape the chars that would break the URL itself (`& = ? #`
    // and whitespace).
    const basePath = path.startsWith("/") ? path : `/${path}`;
    const queryParts: string[] = [];
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null || v === "") continue;
      queryParts.push(`${encodeLinkedInKey(k)}=${encodeLinkedInValue(String(v))}`);
    }
    const url = `${LINKEDIN_BASE_URL}${basePath}${queryParts.length ? `?${queryParts.join("&")}` : ""}`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...LINKEDIN_BASE_HEADERS,
      ...extraHeaders,
    };
    let init: RequestInit = { method, headers };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      init = { ...init, body: JSON.stringify(body) };
    }

    const res = await this.fetchImpl(url, init);
    const text = await res.text();

    // Rate-limit short-circuit: check status FIRST so a non-JSON body
    // (LinkedIn's 429 page is plain text) doesn't bury the signal.
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get("retry-after") ?? "60") * 1000;
      throw new RateLimitedError(
        `LinkedIn API rate limited`,
        Number.isFinite(retryAfter) ? retryAfter : 60_000,
        "linkedin",
      );
    }

    let parsed: unknown = {};
    let parseFailed = false;
    if (text.length > 0) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parseFailed = true;
      }
    }

    if (!res.ok) {
      // 401 with auto-refresh enabled: stale access token. Invalidate the
      // cache and retry the call exactly once with a freshly minted token.
      // Without auto-refresh, a 401 just bubbles up — user must re-auth.
      if (res.status === 401 && this.tokenManager && !isRetry) {
        this.tokenManager.invalidate();
        return this.request(method, path, query, body, extraHeaders, true);
      }
      if (parseFailed) {
        throw makeLinkedInError(
          `LinkedIn ${method} ${path} returned non-JSON status ${res.status}: ${text.slice(0, 200)}`,
          res.status,
        );
      }
      const errBody = parsed as Partial<{ message: string; serviceErrorCode: number; status: number }>;
      throw makeLinkedInError(
        `LinkedIn ${method} ${path} failed (${res.status}): ${errBody.message ?? text.slice(0, 200)}`,
        res.status,
        errBody,
      );
    }

    if (parseFailed) {
      throw makeLinkedInError(
        `LinkedIn ${method} ${path} returned status ${res.status} but body was not JSON: ${text.slice(0, 200)}`,
        res.status,
      );
    }

    return parsed;
  }
}

/**
 * Encode a query-string key for LinkedIn. Keys use dot-notation
 * (`dateRange.start.year`) and indexed-array notation (`accounts[0]`); both
 * `.` and `[`/`]` must remain raw. Spaces and URL-meta chars get escaped.
 */
function encodeLinkedInKey(k: string): string {
  return k.replace(/[\s&=?#]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/**
 * Encode a query-string value for LinkedIn. Pass-through for `, : ( ) [ ] .`
 * and any pre-existing `%XX` escapes the caller embedded for Rest.li 2.0
 * data-vs-structure distinction. Escape only `& = ? #` and whitespace.
 */
function encodeLinkedInValue(v: string): string {
  return v.replace(/[\s&=?#]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function makeLinkedInError(
  message: string,
  status: number,
  body: Partial<{ message: string; serviceErrorCode: number }> = {},
): LinkedInApiError {
  const err = new Error(message) as LinkedInApiError;
  err.name = "LinkedInApiError";
  err.status = status;
  if (typeof body.serviceErrorCode === "number") err.serviceErrorCode = body.serviceErrorCode;
  if (typeof body.message === "string") err.liMessage = body.message;
  return err;
}

/**
 * Stand up a TokenManager for this account when the OAuth wizard configured
 * a refresh path (refresh_token_ref + client_id_ref + client_secret_ref).
 * Otherwise returns null and the client uses the legacy token_ref directly.
 */
function buildTokenManager(
  account: LinkedInAccount,
  fetchImpl: FetchLike,
  auditLogger?: AuditLogger,
): TokenManager | null {
  if (
    !account.refresh_token_ref ||
    !account.client_id_ref ||
    !account.client_secret_ref
  ) {
    return null;
  }
  return new TokenManager({
    platform: "linkedin",
    accountLabel: account.label,
    refreshTokenRef: account.refresh_token_ref,
    clientIdRef: account.client_id_ref,
    clientSecretRef: account.client_secret_ref,
    refreshFn: (creds, refreshToken) =>
      refreshLinkedInAccessToken(creds, refreshToken, fetchImpl),
    ...(auditLogger ? { auditLogger } : {}),
  });
}
