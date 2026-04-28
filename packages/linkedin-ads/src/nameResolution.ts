import type { LinkedInClient } from "./LinkedInClient.js";

/**
 * URN → human-readable name resolution for LinkedIn analytics responses.
 *
 * Analytics responses come back with `pivotValues: ["urn:li:sponsoredCampaign:123"]`
 * and no names. This module fetches the relevant entities once per analytics call
 * and builds a URN → name map so callers can decorate rows with `pivot_name`.
 *
 * Currently supports CAMPAIGN and CAMPAIGN_GROUP pivots. Extending to CREATIVE,
 * MEMBER_COMPANY, and ACCOUNT is straightforward; tracked for v0.2.x.
 */

export interface NameMap {
  [urn: string]: string;
}

/**
 * Fetch all campaigns for the account and build a URN → name map.
 * One API call regardless of how many URNs need resolution.
 */
export async function buildCampaignNameMap(
  client: LinkedInClient,
  accountId: string,
): Promise<NameMap> {
  const map: NameMap = {};
  try {
    const res = (await client.get(
      `/adAccounts/${accountId}/adCampaigns`,
      { q: "search", count: "500" },
    )) as { elements?: Array<{ id?: number | string; name?: string }> };
    for (const el of res.elements ?? []) {
      if (el.id !== undefined && el.name) {
        map[`urn:li:sponsoredCampaign:${el.id}`] = el.name;
      }
    }
  } catch {
    // Best effort: if name resolution fails, callers fall through with raw URNs.
  }
  return map;
}

/**
 * Fetch all campaign groups for the account and build a URN → name map.
 */
export async function buildCampaignGroupNameMap(
  client: LinkedInClient,
  accountId: string,
): Promise<NameMap> {
  const map: NameMap = {};
  try {
    const res = (await client.get(
      `/adAccounts/${accountId}/adCampaignGroups`,
      { q: "search", count: "500" },
    )) as { elements?: Array<{ id?: number | string; name?: string }> };
    for (const el of res.elements ?? []) {
      if (el.id !== undefined && el.name) {
        map[`urn:li:sponsoredCampaignGroup:${el.id}`] = el.name;
      }
    }
  } catch {
    /* best effort */
  }
  return map;
}

/**
 * Decorate analytics elements with `pivot_name` looked up from a name map.
 * Mutates the elements in place AND returns the same array for chaining.
 */
export function decorateAnalyticsWithNames(
  elements: unknown[],
  nameMap: NameMap,
): unknown[] {
  for (const el of elements) {
    if (typeof el !== "object" || el === null) continue;
    const row = el as Record<string, unknown>;
    const pivots = row.pivotValues;
    if (Array.isArray(pivots) && pivots.length > 0 && typeof pivots[0] === "string") {
      const urn = pivots[0];
      if (nameMap[urn]) {
        row.pivot_name = nameMap[urn];
      }
    }
  }
  return elements;
}

/**
 * Choose the right name-map builder for a given pivot. Returns null if the
 * pivot doesn't have a built-in resolver (callers fall through with raw URNs).
 */
export async function resolveNamesForPivot(
  pivot: string,
  client: LinkedInClient,
  accountId: string,
): Promise<NameMap | null> {
  if (pivot === "CAMPAIGN") return buildCampaignNameMap(client, accountId);
  if (pivot === "CAMPAIGN_GROUP") return buildCampaignGroupNameMap(client, accountId);
  return null;
}
