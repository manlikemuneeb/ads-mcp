import {
  type Ga4Property,
  GoogleOAuth,
  type RateLimiter,
  RateLimitedError,
} from "@manlikemuneeb/ads-mcp-core";

const DATA_API_BASE = "https://analyticsdata.googleapis.com/v1beta";
const ADMIN_API_BASE = "https://analyticsadmin.googleapis.com/v1beta";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface Ga4ApiError extends Error {
  status: number;
  api: "data" | "admin";
}

/**
 * GA4 client wrapping both Data API and Admin API. Same OAuth instance covers
 * both since they share the analytics.* scopes.
 *
 * Read scope:  https://www.googleapis.com/auth/analytics.readonly
 * Write scope: https://www.googleapis.com/auth/analytics.edit
 */
export class Ga4Client {
  private readonly auth: GoogleOAuth;

  constructor(
    private readonly property: Ga4Property,
    private readonly rateLimiter: RateLimiter,
    private readonly fetchImpl: FetchLike = globalThis.fetch.bind(globalThis),
  ) {
    this.auth = new GoogleOAuth(property.oauth_credentials_ref, property.label, fetchImpl);
  }

  getPropertyId(): string {
    return this.property.property_id;
  }

  /** Data API: POST `/properties/{id}:runReport` etc. */
  async data(method: string, body: Record<string, unknown>): Promise<unknown> {
    return this.request("POST", `${DATA_API_BASE}/properties/${this.property.property_id}:${method}`, body, "data");
  }

  /** Admin API: arbitrary path under `/v1beta/`. */
  async admin(
    method: "GET" | "POST" | "PATCH" | "DELETE",
    path: string,
    body?: Record<string, unknown>,
    query: Record<string, string | undefined> = {},
  ): Promise<unknown> {
    const url = new URL(`${ADMIN_API_BASE}${path.startsWith("/") ? path : `/${path}`}`);
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== "") url.searchParams.set(k, v);
    }
    return this.request(method, url.toString(), body, "admin");
  }

  private async request(
    method: "GET" | "POST" | "PATCH" | "DELETE",
    url: string,
    body: Record<string, unknown> | undefined,
    api: "data" | "admin",
  ): Promise<unknown> {
    this.rateLimiter.acquire("ga4");
    const accessToken = await this.auth.getAccessToken();

    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    };
    let init: RequestInit = { method, headers };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      init = { ...init, body: JSON.stringify(body) };
    }

    const res = await this.fetchImpl(url, init);
    const text = await res.text();

    if (res.status === 429) {
      const retryAfter = Number(res.headers.get("retry-after") ?? "60") * 1000;
      throw new RateLimitedError(
        `GA4 ${api} API rate limited`,
        Number.isFinite(retryAfter) ? retryAfter : 60_000,
        "ga4",
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
      const errEnv = (parsed as { error?: { message?: string } }).error ?? {};
      const msg = parseFailed ? text.slice(0, 200) : (errEnv.message ?? text.slice(0, 200));
      const err = new Error(`GA4 ${api} ${method} ${url} failed (${res.status}): ${msg}`) as Ga4ApiError;
      err.name = "Ga4ApiError";
      err.status = res.status;
      err.api = api;
      throw err;
    }

    return parsed;
  }
}
