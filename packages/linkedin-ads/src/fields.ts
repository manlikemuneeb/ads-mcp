import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Field manifests loaded from packages/linkedin-ads/fixtures/ at module init.
 *
 * Each tool imports the named export it needs instead of embedding a list.
 * To add or remove a field after a LinkedIn release: edit the JSON, rebuild,
 * no source code change required. The fixtures dir is included in the
 * published tarball (see package.json `files`).
 *
 * The path resolution uses import.meta.url, which works in both:
 *   - dev (running compiled output from packages/linkedin-ads/dist/)
 *   - npm-installed (node_modules/@manlikemuneeb/ads-mcp-linkedin/dist/)
 * because in both cases the relative path from `dist/` to `fixtures/` is
 * the same: `../fixtures/...`.
 */

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(here, "..", "fixtures");

interface AnalyticsFieldsManifest {
  doc_url: string;
  doc_version: string;
  max_fields: number;
  always_include: string[];
  fields_full: string[];
  fields_account_overview: string[];
  fields_campaigns_list: string[];
}

const manifest: AnalyticsFieldsManifest = JSON.parse(
  readFileSync(resolve(fixturesDir, "fields-analytics.json"), "utf8"),
);

export const LINKEDIN_DOC_URL = manifest.doc_url;
export const LINKEDIN_DOC_VERSION = manifest.doc_version;
export const LINKEDIN_ANALYTICS_MAX_FIELDS = manifest.max_fields;

/** Comma-joined list for the `fields=` query param of /adAnalytics. */
export const LINKEDIN_ANALYTICS_FIELDS_FULL = manifest.fields_full.join(",");
export const LINKEDIN_ANALYTICS_FIELDS_ACCOUNT_OVERVIEW =
  manifest.fields_account_overview.join(",");
export const LINKEDIN_ANALYTICS_FIELDS_CAMPAIGNS_LIST =
  manifest.fields_campaigns_list.join(",");

/** Raw arrays for callers that need them (tests, dynamic field selection). */
export const LINKEDIN_ANALYTICS_MANIFEST = manifest;
