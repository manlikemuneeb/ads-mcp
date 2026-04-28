import { describe, expect, it } from "vitest";
import {
  META_ACCOUNT_INFO_FIELDS,
  META_AD_CREATIVE_EXPANSION,
  META_AD_FIELDS,
  META_ADSET_FIELDS,
  META_ADSET_PACING_FIELDS,
  META_CAMPAIGN_FIELDS,
  META_CAMPAIGN_PACING_FIELDS,
  META_DOC_URL,
  META_DOC_VERSION,
  META_INSIGHTS_ACCOUNT_OVERVIEW,
  META_INSIGHTS_ADS_LIST,
  META_INSIGHTS_ADSETS_LIST,
  META_INSIGHTS_CAMPAIGNS_LIST,
  META_INSIGHTS_CREATIVE,
  META_INSIGHTS_DEMOGRAPHICS,
  META_INSIGHTS_FUNNEL,
  META_INSIGHTS_MANIFEST,
  META_INSIGHTS_PLACEMENTS,
} from "../src/fields.js";

describe("Meta fields manifest", () => {
  it("loads doc metadata", () => {
    expect(META_DOC_URL).toMatch(/developers\.facebook\.com/);
    expect(META_DOC_VERSION).toMatch(/^v\d+\.\d+$/);
  });

  it("every published slot is a non-empty comma-joined string", () => {
    const slots = [
      META_INSIGHTS_ACCOUNT_OVERVIEW,
      META_INSIGHTS_CAMPAIGNS_LIST,
      META_INSIGHTS_ADSETS_LIST,
      META_INSIGHTS_ADS_LIST,
      META_INSIGHTS_CREATIVE,
      META_INSIGHTS_DEMOGRAPHICS,
      META_INSIGHTS_PLACEMENTS,
      META_INSIGHTS_FUNNEL,
      META_ACCOUNT_INFO_FIELDS,
      META_CAMPAIGN_FIELDS,
      META_ADSET_FIELDS,
      META_AD_FIELDS,
      META_CAMPAIGN_PACING_FIELDS,
      META_ADSET_PACING_FIELDS,
    ];
    for (const slot of slots) {
      expect(typeof slot).toBe("string");
      expect(slot.length).toBeGreaterThan(0);
      expect(slot).toContain(",");
    }
  });

  it("ad creative expansion is the Graph API field-expansion string", () => {
    expect(META_AD_CREATIVE_EXPANSION).toContain("creative{");
    expect(META_AD_CREATIVE_EXPANSION).toContain("name");
    expect(META_AD_CREATIVE_EXPANSION).toContain("created_time");
  });

  it("insights slots all carry the core impressions+clicks+spend triple", () => {
    const insightSlots = [
      META_INSIGHTS_ACCOUNT_OVERVIEW,
      META_INSIGHTS_CAMPAIGNS_LIST,
      META_INSIGHTS_ADSETS_LIST,
      META_INSIGHTS_ADS_LIST,
      META_INSIGHTS_CREATIVE,
      META_INSIGHTS_DEMOGRAPHICS,
      META_INSIGHTS_PLACEMENTS,
      META_INSIGHTS_FUNNEL,
    ];
    for (const slot of insightSlots) {
      expect(slot).toContain("impressions");
      expect(slot).toContain("clicks");
      expect(slot).toContain("spend");
    }
  });

  it("video-bearing slots include the four watched-actions fields", () => {
    const videoBearing = [META_INSIGHTS_ADS_LIST, META_INSIGHTS_CREATIVE];
    for (const slot of videoBearing) {
      expect(slot).toContain("video_p25_watched_actions");
      expect(slot).toContain("video_p50_watched_actions");
      expect(slot).toContain("video_p75_watched_actions");
      expect(slot).toContain("video_p100_watched_actions");
    }
  });

  it("pacing slots carry budget_remaining (the field that makes pacing reports useful)", () => {
    expect(META_CAMPAIGN_PACING_FIELDS).toContain("budget_remaining");
    expect(META_ADSET_PACING_FIELDS).toContain("budget_remaining");
  });

  it("funnel slot carries the conversion ranking fields", () => {
    expect(META_INSIGHTS_FUNNEL).toContain("conversion_rate_ranking");
    expect(META_INSIGHTS_FUNNEL).toContain("quality_ranking");
    expect(META_INSIGHTS_FUNNEL).toContain("engagement_rate_ranking");
  });

  it("manifest object is shape-stable and exposes the raw arrays", () => {
    expect(Array.isArray(META_INSIGHTS_MANIFEST.insights_account_overview)).toBe(
      true,
    );
    expect(Array.isArray(META_INSIGHTS_MANIFEST.campaigns_list)).toBe(true);
    expect(typeof META_INSIGHTS_MANIFEST.ads_creative_expansion).toBe("string");
  });
});
