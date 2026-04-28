import {
  type GscSite,
  GoogleOAuth,
  type RateLimiter,
  RateLimitedError,
} from "@manlikemuneeb/ads-mcp-core";

const WEBMASTERS_BASE = "https://www.googleapis.com/webmasters/v3";
const SC_BASE = "https://searchconsole.googleapis.com/v1";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface GscApiError extends Error {
  status: number;
}

/**
 * GSC client. Two surfaces:
 *   - webmasters/v3 for sites and sitemaps
 *   - searchconsole/v1 for search analytics and URL inspection
 *
 * Scope: https://www.googleapis.com/auth/webmasters
 */
export class GscClient {
  private readonly auth: GoogleOAuth;

  constructor(
    private readonly site: GscSite,
    private readonly rateLimiter: RateLimiter,
    private readonly fetchImpl: FetchLike = globalThis.fetch.bind(globalThis),
  ) {
    this.auth = new GoogleOAuth(site.oauth_credentials_ref, site.label, fetchImpl);
  }

  getSiteUrl(): string {
    return this.site.site_url;
  }

  async webmasters(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    body?: Record<string, unknown>,
  ): Promise<unknown> {
    return this.request(method, `${WEBMASTERS_BASE}${path.startsWith("/") ? path : `/${path}`}`, body);
  }

  async searchconsole(
    method: "POST",
    path: string,
    body: Record<string, unknown>,
  ): Promise<unknown> {
    return this.request(method, `${SC_BASE}${path.startsWith("/") ? path : `/${path}`}`, body);
  }

  private async request(
    method: "GET" | "POST" | "PUT" | "DELETE",
    url: string,
    body: Record<string, unknown> | undefined,
  ): Promise<unknown> {
    this.rateLimiter.acquire("gsc");
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
        "GSC API rate limited",
        Number.isFinite(retryAfter) ? retryAfter : 60_000,
        "gsc",
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
      const err = new Error(`GSC ${method} ${url} failed (${res.status}): ${msg}`) as GscApiError;
      err.name = "GscApiError";
      err.status = res.status;
      throw err;
    }
    return parsed;
  }
}

/** GSC site URLs in URL paths must be percent-encoded. */
export function encodeSite(siteUrl: string): string {
  return encodeURIComponent(siteUrl);
}
