import {
  type GoogleAdsAccount,
  type RateLimiter,
  RateLimitedError,
  SecretsManager,
} from "@manlikemuneeb/ads-mcp-core";
import { type FetchLike, googleAuthForAdsAccount } from "./GoogleAuth.js";
import type { GoogleOAuth } from "@manlikemuneeb/ads-mcp-core";
import { GOOGLE_ADS_BASE_URL } from "./version.js";

export interface GoogleAdsApiError extends Error {
  status: number;
  errorCode?: string;
  details?: unknown;
}

export class GoogleAdsClient {
  private readonly auth: GoogleOAuth;

  constructor(
    private readonly account: GoogleAdsAccount,
    private readonly rateLimiter: RateLimiter,
    private readonly fetchImpl: FetchLike = globalThis.fetch.bind(globalThis),
  ) {
    this.auth = googleAuthForAdsAccount(account, fetchImpl);
  }

  getCustomerId(): string {
    return this.account.customer_id;
  }

  /**
   * Run a GAQL query. Returns the raw `{results, fieldMask, ...}` envelope.
   * For pagination, callers chain `pageToken` from the response.
   */
  async search(query: string, pageToken?: string): Promise<unknown> {
    const body: Record<string, unknown> = { query };
    if (pageToken) body.pageToken = pageToken;
    return this.post(`/customers/${this.account.customer_id}/googleAds:search`, body);
  }

  /**
   * Mutate one or more campaigns. The shape of `operations` matches Google's API:
   *   [{ update: { resourceName, ...fields }, updateMask: "field1,field2" }]
   *   [{ create: { ... } }]
   *   [{ remove: "resourceName" }]
   */
  async mutateCampaigns(operations: unknown[]): Promise<unknown> {
    return this.post(`/customers/${this.account.customer_id}/campaigns:mutate`, {
      operations,
    });
  }

  async mutateCampaignBudgets(operations: unknown[]): Promise<unknown> {
    return this.post(`/customers/${this.account.customer_id}/campaignBudgets:mutate`, {
      operations,
    });
  }

  async mutateAdGroups(operations: unknown[]): Promise<unknown> {
    return this.post(`/customers/${this.account.customer_id}/adGroups:mutate`, {
      operations,
    });
  }

  async post(path: string, body: Record<string, unknown>): Promise<unknown> {
    return this.request("POST", path, body);
  }

  private async request(
    method: "POST" | "GET",
    path: string,
    body: Record<string, unknown> | undefined,
  ): Promise<unknown> {
    this.rateLimiter.acquire("google_ads");

    const [accessToken, developerToken] = await Promise.all([
      this.auth.getAccessToken(),
      SecretsManager.resolve(this.account.developer_token_ref),
    ]);

    const url = `${GOOGLE_ADS_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      "developer-token": developerToken,
      Accept: "application/json",
    };
    if (this.account.login_customer_id) {
      headers["login-customer-id"] = this.account.login_customer_id;
    }
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
        "Google Ads API rate limited",
        Number.isFinite(retryAfter) ? retryAfter : 60_000,
        "google_ads",
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
      if (parseFailed) {
        throw makeGoogleAdsError(
          `Google Ads ${method} ${path} returned non-JSON status ${res.status}: ${text.slice(0, 200)}`,
          res.status,
        );
      }
      // Google's error envelope: {error: {code, message, status, details: [...]}}
      const errEnv = (parsed as { error?: { code?: number; message?: string; status?: string; details?: unknown[] } }).error ?? {};
      throw makeGoogleAdsError(
        `Google Ads ${method} ${path} failed (${res.status}): ${errEnv.message ?? text.slice(0, 200)}`,
        res.status,
        errEnv.status,
        errEnv.details,
      );
    }

    if (parseFailed) {
      throw makeGoogleAdsError(
        `Google Ads ${method} ${path} returned status ${res.status} but body was not JSON: ${text.slice(0, 200)}`,
        res.status,
      );
    }

    return parsed;
  }
}

function makeGoogleAdsError(
  message: string,
  status: number,
  errorCode?: string,
  details?: unknown,
): GoogleAdsApiError {
  const err = new Error(message) as GoogleAdsApiError;
  err.name = "GoogleAdsApiError";
  err.status = status;
  if (errorCode !== undefined) err.errorCode = errorCode;
  if (details !== undefined) err.details = details;
  return err;
}
