import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Field manifests loaded from packages/meta-ads/fixtures/ at module init.
 *
 * Each tool file imports the named export it needs instead of embedding
 * a hardcoded list. To add or remove a field after a Meta API release:
 * edit fixtures/fields-insights.json and rebuild — no source change.
 *
 * Path resolution via import.meta.url works in dev (source layout) and
 * post-publish (node_modules/.../dist + node_modules/.../fixtures), since
 * `src/` and `dist/` are both one level below the package root.
 */

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(here, "..", "fixtures");

interface InsightsManifest {
  doc_url: string;
  doc_version: string;

  insights_account_overview: string[];
  account_info: string[];

  insights_campaigns_list: string[];
  campaigns_list: string[];

  insights_adsets_list: string[];
  adsets_list: string[];

  insights_ads_list: string[];
  ads_list: string[];

  insights_creative: string[];
  ads_creative_expansion: string;

  insights_demographics: string[];
  insights_placements: string[];
  insights_funnel: string[];

  campaigns_pacing: string[];
  adsets_pacing: string[];
}

const manifest: InsightsManifest = JSON.parse(
  readFileSync(resolve(fixturesDir, "fields-insights.json"), "utf8"),
);

export const META_DOC_URL = manifest.doc_url;
export const META_DOC_VERSION = manifest.doc_version;

// Insights field strings (comma-joined, ready to drop into `fields=` query).
export const META_INSIGHTS_ACCOUNT_OVERVIEW =
  manifest.insights_account_overview.join(",");
export const META_INSIGHTS_CAMPAIGNS_LIST =
  manifest.insights_campaigns_list.join(",");
export const META_INSIGHTS_ADSETS_LIST = manifest.insights_adsets_list.join(",");
export const META_INSIGHTS_ADS_LIST = manifest.insights_ads_list.join(",");
export const META_INSIGHTS_CREATIVE = manifest.insights_creative.join(",");
export const META_INSIGHTS_DEMOGRAPHICS =
  manifest.insights_demographics.join(",");
export const META_INSIGHTS_PLACEMENTS = manifest.insights_placements.join(",");
export const META_INSIGHTS_FUNNEL = manifest.insights_funnel.join(",");

// Entity field strings.
export const META_ACCOUNT_INFO_FIELDS = manifest.account_info.join(",");
export const META_CAMPAIGN_FIELDS = manifest.campaigns_list.join(",");
export const META_ADSET_FIELDS = manifest.adsets_list.join(",");
export const META_AD_FIELDS = manifest.ads_list.join(",");

// Pacing report fields (entity shape, not insights).
export const META_CAMPAIGN_PACING_FIELDS = manifest.campaigns_pacing.join(",");
export const META_ADSET_PACING_FIELDS = manifest.adsets_pacing.join(",");

// Pre-formatted Graph API field-expansion string (already comma+brace
// shaped); kept verbatim from the manifest.
export const META_AD_CREATIVE_EXPANSION = manifest.ads_creative_expansion;

// Raw manifest for tests / dynamic field selection.
export const META_INSIGHTS_MANIFEST = manifest;
