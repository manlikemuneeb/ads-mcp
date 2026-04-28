import { describe, expect, it } from "vitest";
import {
  LINKEDIN_ANALYTICS_FIELDS_ACCOUNT_OVERVIEW,
  LINKEDIN_ANALYTICS_FIELDS_CAMPAIGNS_LIST,
  LINKEDIN_ANALYTICS_FIELDS_FULL,
  LINKEDIN_ANALYTICS_MANIFEST,
  LINKEDIN_ANALYTICS_MAX_FIELDS,
  LINKEDIN_DOC_URL,
  LINKEDIN_DOC_VERSION,
} from "../src/fields.js";

describe("LinkedIn fields manifest", () => {
  it("loads doc metadata", () => {
    expect(LINKEDIN_DOC_URL).toMatch(/learn\.microsoft\.com/);
    expect(LINKEDIN_DOC_VERSION).toMatch(/^li-lms-\d{4}-\d{2}$/);
    expect(LINKEDIN_ANALYTICS_MAX_FIELDS).toBe(20);
  });

  it("every published slot is non-empty", () => {
    expect(LINKEDIN_ANALYTICS_FIELDS_FULL.length).toBeGreaterThan(0);
    expect(LINKEDIN_ANALYTICS_FIELDS_ACCOUNT_OVERVIEW.length).toBeGreaterThan(0);
    expect(LINKEDIN_ANALYTICS_FIELDS_CAMPAIGNS_LIST.length).toBeGreaterThan(0);
  });

  it("the full slot includes the always_include fields", () => {
    for (const field of LINKEDIN_ANALYTICS_MANIFEST.always_include) {
      expect(LINKEDIN_ANALYTICS_FIELDS_FULL).toContain(field);
    }
  });

  it("slot widths stay within the LinkedIn 20-field cap", () => {
    expect(LINKEDIN_ANALYTICS_MANIFEST.fields_full.length).toBeLessThanOrEqual(
      LINKEDIN_ANALYTICS_MAX_FIELDS,
    );
    expect(
      LINKEDIN_ANALYTICS_MANIFEST.fields_account_overview.length,
    ).toBeLessThanOrEqual(LINKEDIN_ANALYTICS_MAX_FIELDS);
    expect(
      LINKEDIN_ANALYTICS_MANIFEST.fields_campaigns_list.length,
    ).toBeLessThanOrEqual(LINKEDIN_ANALYTICS_MAX_FIELDS);
  });

  it("comma-joined exports contain every field from the underlying array", () => {
    for (const field of LINKEDIN_ANALYTICS_MANIFEST.fields_full) {
      expect(LINKEDIN_ANALYTICS_FIELDS_FULL).toContain(field);
    }
  });

  it("snapshot: full field set is the canonical /adAnalytics list (catches accidental edits)", () => {
    // If this test fails, you intentionally edited the fixture — update the
    // snapshot. This guards against silent removal of a field that tools rely on.
    expect(LINKEDIN_ANALYTICS_MANIFEST.fields_full).toMatchInlineSnapshot(`
      [
        "dateRange",
        "pivotValues",
        "impressions",
        "clicks",
        "costInLocalCurrency",
        "costInUsd",
        "approximateMemberReach",
        "landingPageClicks",
        "shares",
        "follows",
        "likes",
        "comments",
        "totalEngagements",
        "videoViews",
        "videoFirstQuartileCompletions",
        "videoMidpointCompletions",
        "videoThirdQuartileCompletions",
        "videoCompletions",
        "externalWebsiteConversions",
      ]
    `);
  });
});
