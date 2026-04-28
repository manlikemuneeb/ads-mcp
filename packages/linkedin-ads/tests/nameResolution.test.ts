import { type LinkedInAccount, RateLimiter } from "@manlikemuneeb/ads-mcp-core";
import { describe, expect, it } from "vitest";
import { LinkedInClient } from "../src/LinkedInClient.js";
import {
  buildCampaignGroupNameMap,
  buildCampaignNameMap,
  decorateAnalyticsWithNames,
  resolveNamesForPivot,
} from "../src/nameResolution.js";

const account: LinkedInAccount = {
  label: "test",
  mode: "read",
  ad_account_id: "123456789",
  token_ref: { kind: "inline", value: "test-token" },
};

function clientThatReturns(payload: unknown): LinkedInClient {
  const fetch = async () =>
    new Response(JSON.stringify(payload), { status: 200 });
  return new LinkedInClient(account, new RateLimiter(), fetch);
}

describe("nameResolution — URN to name decoration", () => {
  describe("buildCampaignNameMap", () => {
    it("builds a urn:li:sponsoredCampaign:<id> -> name map from /adCampaigns elements", async () => {
      const c = clientThatReturns({
        elements: [
          { id: 111, name: "Q1 awareness" },
          { id: 222, name: "Q1 conversions" },
        ],
      });
      const map = await buildCampaignNameMap(c, account.ad_account_id);
      expect(map["urn:li:sponsoredCampaign:111"]).toBe("Q1 awareness");
      expect(map["urn:li:sponsoredCampaign:222"]).toBe("Q1 conversions");
    });

    it("returns an empty map (no throw) when /adCampaigns errors", async () => {
      const fetch = async () =>
        new Response("Internal", { status: 500 });
      const c = new LinkedInClient(account, new RateLimiter(), fetch);
      const map = await buildCampaignNameMap(c, account.ad_account_id);
      expect(map).toEqual({});
    });

    it("skips entries missing id or name", async () => {
      const c = clientThatReturns({
        elements: [
          { id: 123, name: "real" },
          { name: "nameless" },
          { id: 456 },
          {},
        ],
      });
      const map = await buildCampaignNameMap(c, account.ad_account_id);
      expect(map).toEqual({ "urn:li:sponsoredCampaign:123": "real" });
    });

    it("hits the account-scoped /adAccounts/{id}/adCampaigns path", async () => {
      let capturedUrl = "";
      const fetch = async (url: string) => {
        capturedUrl = url;
        return new Response(JSON.stringify({ elements: [] }), { status: 200 });
      };
      const c = new LinkedInClient(account, new RateLimiter(), fetch);
      await buildCampaignNameMap(c, account.ad_account_id);
      expect(capturedUrl).toContain("/rest/adAccounts/123456789/adCampaigns");
      expect(capturedUrl).toContain("q=search");
    });
  });

  describe("buildCampaignGroupNameMap", () => {
    it("builds a urn:li:sponsoredCampaignGroup:<id> -> name map", async () => {
      const c = clientThatReturns({
        elements: [
          { id: 999, name: "Always-on retargeting" },
          { id: 1001, name: "Brand" },
        ],
      });
      const map = await buildCampaignGroupNameMap(c, account.ad_account_id);
      expect(map["urn:li:sponsoredCampaignGroup:999"]).toBe(
        "Always-on retargeting",
      );
      expect(map["urn:li:sponsoredCampaignGroup:1001"]).toBe("Brand");
    });
  });

  describe("decorateAnalyticsWithNames", () => {
    it("attaches pivot_name when the first pivotValue matches the map", () => {
      const elements: Array<Record<string, unknown>> = [
        { pivotValues: ["urn:li:sponsoredCampaign:111"], impressions: 100 },
        { pivotValues: ["urn:li:sponsoredCampaign:222"], impressions: 200 },
      ];
      decorateAnalyticsWithNames(elements, {
        "urn:li:sponsoredCampaign:111": "Q1 awareness",
        "urn:li:sponsoredCampaign:222": "Q1 conversions",
      });
      expect(elements[0]?.pivot_name).toBe("Q1 awareness");
      expect(elements[1]?.pivot_name).toBe("Q1 conversions");
    });

    it("leaves pivot_name unset when the URN is not in the map", () => {
      const elements: Array<Record<string, unknown>> = [
        { pivotValues: ["urn:li:sponsoredCampaign:999"], impressions: 5 },
      ];
      decorateAnalyticsWithNames(elements, {
        "urn:li:sponsoredCampaign:111": "Q1 awareness",
      });
      expect(elements[0]?.pivot_name).toBeUndefined();
    });

    it("is a no-op for rows without a pivotValues array", () => {
      const elements = [
        { dateRange: {}, impressions: 1 },
        null,
        "not-an-object",
      ];
      // Should not throw and should not mutate non-row entries.
      expect(() =>
        decorateAnalyticsWithNames(elements, {
          "urn:li:sponsoredCampaign:111": "Q1 awareness",
        }),
      ).not.toThrow();
      expect((elements[0] as Record<string, unknown>).pivot_name).toBeUndefined();
    });

    it("returns the same array reference for chaining", () => {
      const elements: unknown[] = [];
      const result = decorateAnalyticsWithNames(elements, {});
      expect(result).toBe(elements);
    });
  });

  describe("resolveNamesForPivot", () => {
    it("returns a campaign map for pivot CAMPAIGN", async () => {
      const c = clientThatReturns({
        elements: [{ id: 111, name: "Q1 awareness" }],
      });
      const map = await resolveNamesForPivot(
        "CAMPAIGN",
        c,
        account.ad_account_id,
      );
      expect(map).not.toBeNull();
      expect(map?.["urn:li:sponsoredCampaign:111"]).toBe("Q1 awareness");
    });

    it("returns a campaign-group map for pivot CAMPAIGN_GROUP", async () => {
      const c = clientThatReturns({
        elements: [{ id: 999, name: "Brand" }],
      });
      const map = await resolveNamesForPivot(
        "CAMPAIGN_GROUP",
        c,
        account.ad_account_id,
      );
      expect(map).not.toBeNull();
      expect(map?.["urn:li:sponsoredCampaignGroup:999"]).toBe("Brand");
    });

    it("returns null for pivots without a built-in resolver", async () => {
      const c = clientThatReturns({ elements: [] });
      for (const pivot of [
        "CREATIVE",
        "ACCOUNT",
        "MEMBER_COMPANY",
        "MEMBER_INDUSTRY",
        "MEMBER_JOB_TITLE",
      ]) {
        const map = await resolveNamesForPivot(pivot, c, account.ad_account_id);
        expect(map).toBeNull();
      }
    });
  });
});
