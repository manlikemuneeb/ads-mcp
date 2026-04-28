/**
 * Meta Graph API version constants.
 *
 * Locked 2026-04-27 after live verification against the Meta changelog:
 * v25.0 was released February 2026 (per Meta blog post titled "Introducing
 * Graph API v25.0 and Marketing API v25.0"). v20 deprecated September 2026.
 *
 * Bump procedure when Meta releases a new version:
 * 1. Update META_GRAPH_API_VERSION below
 * 2. Check the changelog for breaking changes:
 *    https://developers.facebook.com/docs/graph-api/changelog
 * 3. Run integration tests against a sandbox account
 */

export const META_GRAPH_API_VERSION = "v25.0";
export const META_GRAPH_BASE_URL = `https://graph.facebook.com/${META_GRAPH_API_VERSION}`;

/** Required scopes for Marketing API read+write. */
export const META_REQUIRED_SCOPES = [
  "ads_read",
  "ads_management",
  "business_management",
] as const;

export const VERSION_HISTORY: Array<{ version: string; lockedAt: string; source: string }> = [
  {
    version: "v25.0",
    lockedAt: "2026-04-27",
    source: "Meta blog: Introducing Graph API v25 and Marketing API v25 (February 2026)",
  },
];
