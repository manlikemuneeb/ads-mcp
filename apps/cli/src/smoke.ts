/**
 * Smoke-ping helpers used by both `doctor` (validate an existing config) and
 * `setup` (validate credentials at entry time, before writing them to disk).
 *
 * Each function accepts a fully-formed account object and returns either
 * { ok: true, summary: "..." } or { ok: false, error: "..." }. Errors are
 * surfaced verbatim so the user can debug.
 */

import { type Ga4Property, type GoogleAdsAccount, type GscSite, type LinkedInAccount, type MetaAccount, RateLimiter } from "@manlikemuneeb/ads-mcp-core";
import { Ga4Client } from "@manlikemuneeb/ads-mcp-ga4";
import { GoogleAdsClient } from "@manlikemuneeb/ads-mcp-google-ads";
import { GscClient } from "@manlikemuneeb/ads-mcp-gsc";
import { LinkedInClient } from "@manlikemuneeb/ads-mcp-linkedin";
import { MetaClient } from "@manlikemuneeb/ads-mcp-meta";

export type SmokeResult = { ok: true; summary: string } | { ok: false; error: string };

const limiter = () => new RateLimiter();

export async function smokeMeta(account: MetaAccount): Promise<SmokeResult> {
  try {
    const client = new MetaClient(account, limiter());
    const me = (await client.get("/me", { fields: "id" })) as { id?: string };
    if (!me.id) return { ok: false, error: "response missing id" };
    return { ok: true, summary: `Meta user id ${me.id}` };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function smokeLinkedIn(account: LinkedInAccount): Promise<SmokeResult> {
  try {
    const client = new LinkedInClient(account, limiter());
    const a = (await client.get(`/adAccounts/${account.ad_account_id}`)) as { id?: number; name?: string };
    if (!a.id) return { ok: false, error: "response missing id" };
    return { ok: true, summary: `account ${a.name ?? a.id}` };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function smokeGoogleAds(account: GoogleAdsAccount): Promise<SmokeResult> {
  try {
    const client = new GoogleAdsClient(account, limiter());
    const r = (await client.search(
      "SELECT customer.id, customer.descriptive_name FROM customer LIMIT 1",
    )) as { results?: Array<{ customer?: { id?: string; descriptiveName?: string } }> };
    const c = r.results?.[0]?.customer;
    if (!c?.id) return { ok: false, error: "response missing customer" };
    return { ok: true, summary: `customer ${c.descriptiveName ?? c.id}` };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function smokeGa4(property: Ga4Property): Promise<SmokeResult> {
  try {
    const client = new Ga4Client(property, limiter());
    const r = (await client.admin("GET", `/properties/${property.property_id}`)) as {
      name?: string;
      displayName?: string;
    };
    if (!r.name) return { ok: false, error: "response missing name" };
    return { ok: true, summary: `property ${r.displayName ?? r.name}` };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function smokeGsc(site: GscSite): Promise<SmokeResult> {
  try {
    const client = new GscClient(site, limiter());
    const r = (await client.webmasters("GET", "/sites")) as { siteEntry?: unknown[] };
    const count = r.siteEntry?.length ?? 0;
    return { ok: true, summary: `${count} sites accessible` };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
