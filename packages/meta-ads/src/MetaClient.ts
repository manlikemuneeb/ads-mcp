import {
  type MetaAccount,
  type RateLimiter,
  RateLimitedError,
  SecretsManager,
} from "@manlikemuneeb/ads-mcp-core";
import { META_GRAPH_BASE_URL } from "./version.js";

export interface MetaApiError extends Error {
  status: number;
  fbCode?: number;
  fbType?: string;
  fbSubcode?: number;
  fbMessage?: string;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Thin HTTP client over the Meta Graph API.
 *
 * Handles:
 *   - Bearer-token auth (NOT in URL query string; the old plugin had that wrong)
 *   - Rate limiter `acquire` before every call
 *   - Structured error parsing (Meta returns `{error: {message, type, code}}`)
 *   - JSON body for POST
 *
 * Does NOT handle:
 *   - Token refresh (separate flow; see future MetaAuth module)
 *   - Retry on 429 (we surface RateLimitedError; caller decides)
 *   - Pagination (callers handle their own paging)
 */
export class MetaClient {
  constructor(
    private readonly account: MetaAccount,
    private readonly rateLimiter: RateLimiter,
    private readonly fetchImpl: FetchLike = globalThis.fetch.bind(globalThis),
  ) {}

  /** Account id with the `act_` prefix that Meta requires on URL paths. */
  getAccountPath(): string {
    return this.account.ad_account_id.startsWith("act_")
      ? this.account.ad_account_id
      : `act_${this.account.ad_account_id}`;
  }

  async get(path: string, query: Record<string, string | number | undefined> = {}): Promise<unknown> {
    return this.request("GET", path, query, undefined);
  }

  async post(path: string, body: Record<string, unknown> = {}): Promise<unknown> {
    return this.request("POST", path, {}, body);
  }

  async delete(path: string): Promise<unknown> {
    return this.request("DELETE", path, {}, undefined);
  }

  private async request(
    method: "GET" | "POST" | "DELETE",
    path: string,
    query: Record<string, string | number | undefined>,
    body: Record<string, unknown> | undefined,
  ): Promise<unknown> {
    this.rateLimiter.acquire("meta");

    const token = await SecretsManager.resolve(this.account.token_ref);
    const url = new URL(`${META_GRAPH_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`);
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== "") {
        url.searchParams.set(k, String(v));
      }
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    };
    let init: RequestInit = { method, headers };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      init = { ...init, body: JSON.stringify(body) };
    }

    const res = await this.fetchImpl(url.toString(), init);
    const text = await res.text();
    let parsed: unknown;
    try {
      parsed = text.length > 0 ? JSON.parse(text) : {};
    } catch {
      // non-JSON response (rare for Graph API errors but possible for 502/504)
      throw makeMetaError(
        `Meta ${method} ${path} returned non-JSON status ${res.status}: ${text.slice(0, 200)}`,
        res.status,
      );
    }

    if (!res.ok) {
      const err = (parsed as { error?: Record<string, unknown> }).error ?? {};
      const fbCode = typeof err.code === "number" ? err.code : undefined;
      // Meta uses code 4 / 17 / 32 / 613 for various rate-limit conditions
      const RATE_LIMIT_CODES = [4, 17, 32, 613];
      if (res.status === 429 || (fbCode !== undefined && RATE_LIMIT_CODES.includes(fbCode))) {
        throw new RateLimitedError(
          `Meta API rate limited: ${(err.message as string) ?? "unknown"}`,
          // Meta's headers don't always include retry-after; default 60s
          60_000,
          "meta",
        );
      }
      throw makeMetaError(
        `Meta ${method} ${path} failed (${res.status}): ${(err.message as string) ?? text.slice(0, 200)}`,
        res.status,
        err,
      );
    }

    return parsed;
  }
}

function makeMetaError(
  message: string,
  status: number,
  fbErr: Record<string, unknown> = {},
): MetaApiError {
  const err = new Error(message) as MetaApiError;
  err.name = "MetaApiError";
  err.status = status;
  if (typeof fbErr.code === "number") err.fbCode = fbErr.code;
  if (typeof fbErr.type === "string") err.fbType = fbErr.type;
  if (typeof fbErr.error_subcode === "number") err.fbSubcode = fbErr.error_subcode;
  if (typeof fbErr.message === "string") err.fbMessage = fbErr.message;
  return err;
}
