/**
 * LinkedIn Marketing API version constants.
 *
 * LinkedIn versions are YYYYMM strings tied to the Marketing Solutions monthly
 * release. Each version is supported for at least 12 months.
 *
 * Locked 2026-04-27 to 202604 (April 2026 release). Old plugin used 202401
 * which is now over the 12-month support window.
 *
 * Bump procedure: rotate to current month or one month back roughly quarterly.
 * https://learn.microsoft.com/en-us/linkedin/marketing/versioning
 */

export const LINKEDIN_VERSION_HEADER = "202604";
export const LINKEDIN_BASE_URL = "https://api.linkedin.com/rest";

/** Required scopes for ads read+write. `rw_ads` covers writes per the docs. */
export const LINKEDIN_REQUIRED_SCOPES = [
  "r_ads",
  "r_ads_reporting",
  "rw_ads",
  "r_organization_social",
] as const;

/** Headers required on every Marketing API request. */
export const LINKEDIN_BASE_HEADERS = {
  "LinkedIn-Version": LINKEDIN_VERSION_HEADER,
  "X-Restli-Protocol-Version": "2.0.0",
} as const;

export const VERSION_HISTORY: Array<{ version: string; lockedAt: string; source: string }> = [
  {
    version: "202604",
    lockedAt: "2026-04-27",
    source: "LinkedIn Marketing API versioning page (current April 2026 release)",
  },
];
