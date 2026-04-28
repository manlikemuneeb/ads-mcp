/**
 * LinkedIn URN and Rest.li 2.0 query helpers.
 *
 * Two flavors of URN encoding depending on context:
 *   - **Top-level array values** (e.g. `accounts[0]=urn:li:sponsoredAccount:123`):
 *     URN colons are RAW. Use `sponsoredAccountUrn(id)`.
 *   - **Inside inline complex values** (e.g. `search=(account:(values:List(...)))`):
 *     URN colons are LITERAL `%3A` text. Use `sponsoredAccountUrnEncoded(id)`.
 *
 * The encoder in LinkedInClient only escapes URL-meta chars and spaces; it
 * passes through `, : ( ) [ ] .` and any pre-existing `%XX` literals untouched.
 * That lets callers craft values with the right mix of raw and escaped chars
 * for Rest.li 2.0's data-vs-structure distinction.
 */

export function sponsoredAccountUrn(accountId: string): string {
  return `urn:li:sponsoredAccount:${accountId}`;
}

export function sponsoredCampaignUrn(campaignId: string): string {
  return `urn:li:sponsoredCampaign:${campaignId}`;
}

export function sponsoredCreativeUrn(creativeId: string): string {
  return `urn:li:sponsoredCreative:${creativeId}`;
}

/** URN with `%3A` literal escapes for use inside inline complex types. */
export function sponsoredAccountUrnEncoded(accountId: string): string {
  return `urn%3Ali%3AsponsoredAccount%3A${accountId}`;
}

export function sponsoredCampaignUrnEncoded(campaignId: string): string {
  return `urn%3Ali%3AsponsoredCampaign%3A${campaignId}`;
}

/**
 * Build dateRange dot-notation params for adAnalytics.
 */
export function dateRangeDotParams(
  startIso: string,
  endIso: string,
): Record<string, string> {
  const start = parseIso(startIso);
  const end = parseIso(endIso);
  return {
    "dateRange.start.year": String(start.year),
    "dateRange.start.month": String(start.month),
    "dateRange.start.day": String(start.day),
    "dateRange.end.year": String(end.year),
    "dateRange.end.month": String(end.month),
    "dateRange.end.day": String(end.day),
  };
}

/**
 * Build the canonical `accounts=List(urn%3Ali%3AsponsoredAccount%3A123,...)`
 * value for adAnalytics. URN colons are LITERAL `%3A` text, parens raw,
 * comma between URNs raw. This is the format LinkedIn's docs prescribe and
 * verified-200 against the live API.
 */
export function accountsListExpression(accountIds: string[]): string {
  return `List(${accountIds.map(sponsoredAccountUrnEncoded).join(",")})`;
}

export function campaignsListExpression(campaignIds: string[]): string {
  return `List(${campaignIds.map(sponsoredCampaignUrnEncoded).join(",")})`;
}

/** Indexed-array params: { 'accounts[0]': 'urn:li:sponsoredAccount:123', ... } */
export function accountsIndexedParams(accountIds: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  accountIds.forEach((id, i) => {
    out[`accounts[${i}]`] = sponsoredAccountUrn(id);
  });
  return out;
}

export function campaignsIndexedParams(campaignIds: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  campaignIds.forEach((id, i) => {
    out[`campaigns[${i}]`] = sponsoredCampaignUrn(id);
  });
  return out;
}

/**
 * Rest.li 2.0 search expression for finding adCampaigns by account.
 * URNs INSIDE this expression need `%3A` literal escapes.
 */
export function searchByAccountExpression(accountIds: string[]): string {
  const urns = accountIds.map(sponsoredAccountUrnEncoded).join(",");
  return `(account:(values:List(${urns})))`;
}

/**
 * Rest.li 2.0 search expression for finding adCreatives by campaign.
 * Used with q=criteria on /adAccounts/{id}/creatives.
 */
export function searchByCampaignExpression(campaignIds: string[]): string {
  const urns = campaignIds.map(sponsoredCampaignUrnEncoded).join(",");
  return `(campaigns:(values:List(${urns})))`;
}

// --- Legacy helpers retained for back-compat ---

export function isoToLinkedInDate(iso: string): { year: number; month: number; day: number } {
  return parseIso(iso);
}

export function inlineDate(d: { year: number; month: number; day: number }): string {
  return `(year:${d.year},month:${d.month},day:${d.day})`;
}

export function inlineDateRange(startIso: string, endIso: string): string {
  return `(start:${inlineDate(parseIso(startIso))},end:${inlineDate(parseIso(endIso))})`;
}

function parseIso(iso: string): { year: number; month: number; day: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) throw new Error(`Expected YYYY-MM-DD, got '${iso}'`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}
