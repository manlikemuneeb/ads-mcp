/**
 * Google Ads REST API version constants.
 *
 * Locked 2026-04-27 after a spike confirmed v22 works end-to-end (manager →
 * child via login-customer-id) with `authorized_user` OAuth credentials.
 * v18 and earlier returned 404 from Google's frontend, indicating those
 * versions are sunset.
 *
 * Bump procedure when Google ships a new version:
 * 1. Update GOOGLE_ADS_API_VERSION below
 * 2. Run `tests/spike-google-ads.ts` to verify the new version works
 * 3. Check release notes for breaking changes:
 *    https://developers.google.com/google-ads/api/docs/release-notes
 * 4. Run integration tests against a sandbox customer
 */

export const GOOGLE_ADS_API_VERSION = "v22";
export const GOOGLE_ADS_BASE_URL = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}`;

/**
 * Version sunset history (for institutional memory, not used at runtime).
 * Update this list when bumping the constant.
 */
export const VERSION_HISTORY: Array<{ version: string; lockedAt: string; spikeResult: "PASS" | "FAIL" }> = [
  { version: "v22", lockedAt: "2026-04-27", spikeResult: "PASS" },
];
