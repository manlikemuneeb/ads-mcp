import { type LinkedInAccount, RateLimiter } from "@manlikemuneeb/ads-mcp-core";
import { describe, expect, it } from "vitest";
import { LinkedInClient } from "../src/LinkedInClient.js";
import {
  accountsListExpression,
  campaignsListExpression,
  inlineDateRange,
  searchByAccountExpression,
  sponsoredAccountUrnEncoded,
  sponsoredCampaignUrnEncoded,
} from "../src/urns.js";

const account: LinkedInAccount = {
  label: "test",
  mode: "read",
  ad_account_id: "123456789",
  token_ref: { kind: "inline", value: "test-token" },
};

describe("URL encoding lock-in (regression guards for the doc-exact format)", () => {
  it("sponsoredAccountUrnEncoded produces literal %3A in URN", () => {
    expect(sponsoredAccountUrnEncoded("123")).toBe("urn%3Ali%3AsponsoredAccount%3A123");
  });

  it("sponsoredCampaignUrnEncoded produces literal %3A in URN", () => {
    expect(sponsoredCampaignUrnEncoded("999")).toBe("urn%3Ali%3AsponsoredCampaign%3A999");
  });

  it("accountsListExpression matches the doc format", () => {
    expect(accountsListExpression(["123456789"])).toBe(
      "List(urn%3Ali%3AsponsoredAccount%3A123456789)",
    );
  });

  it("campaignsListExpression handles multiple URNs comma-separated", () => {
    expect(campaignsListExpression(["111", "222"])).toBe(
      "List(urn%3Ali%3AsponsoredCampaign%3A111,urn%3Ali%3AsponsoredCampaign%3A222)",
    );
  });

  it("searchByAccountExpression nests account URNs with %3A inside the search syntax", () => {
    expect(searchByAccountExpression(["123456789"])).toBe(
      "(account:(values:List(urn%3Ali%3AsponsoredAccount%3A123456789)))",
    );
  });

  it("inlineDateRange produces the canonical (start:(...),end:(...)) form", () => {
    expect(inlineDateRange("2026-04-01", "2026-04-27")).toBe(
      "(start:(year:2026,month:4,day:1),end:(year:2026,month:4,day:27))",
    );
  });

  it("LinkedInClient.get sends commas, parens, colons, and pre-encoded %3A raw on the wire", async () => {
    let capturedUrl = "";
    const fetch = async (url: string) => {
      capturedUrl = url;
      return new Response(JSON.stringify({ elements: [] }), { status: 200 });
    };
    const c = new LinkedInClient(account, new RateLimiter(), fetch);
    await c.get("/adAnalytics", {
      q: "analytics",
      pivot: "CAMPAIGN",
      timeGranularity: "DAILY",
      dateRange: inlineDateRange("2026-04-01", "2026-04-27"),
      accounts: accountsListExpression(["123456789"]),
      fields: "impressions,clicks,costInLocalCurrency",
    });
    expect(capturedUrl).toContain("dateRange=(start:(year:2026,month:4,day:1),end:(year:2026,month:4,day:27))");
    expect(capturedUrl).toContain("accounts=List(urn%3Ali%3AsponsoredAccount%3A123456789)");
    expect(capturedUrl).toContain("fields=impressions,clicks,costInLocalCurrency");
    // Critical: URN colons stay as %3A literal text on the wire (not %253A or raw :)
    expect(capturedUrl).not.toContain("%253A");
    expect(capturedUrl).not.toContain("urn:li:sponsoredAccount:123456789");
    // Structural chars stay raw
    expect(capturedUrl).not.toContain("%2C");
    expect(capturedUrl).not.toContain("%28");
    expect(capturedUrl).not.toContain("%29");
  });

  it("LinkedInClient escapes URL-meta chars (& = ? #) and whitespace", async () => {
    let capturedUrl = "";
    const fetch = async (url: string) => {
      capturedUrl = url;
      return new Response("{}", { status: 200 });
    };
    const c = new LinkedInClient(account, new RateLimiter(), fetch);
    await c.get("/adAnalytics", { weird: "a&b=c?d#e f" });
    expect(capturedUrl).toContain("%26");
    expect(capturedUrl).toContain("%3D");
    expect(capturedUrl).toContain("%3F");
    expect(capturedUrl).toContain("%23");
    expect(capturedUrl).toContain("%20");
  });

  it("LinkedInClient uses account-scoped path for adCampaigns (NEW_PATH_STREAMS)", async () => {
    let capturedUrl = "";
    const fetch = async (url: string) => {
      capturedUrl = url;
      return new Response(JSON.stringify({ elements: [] }), { status: 200 });
    };
    const c = new LinkedInClient(account, new RateLimiter(), fetch);
    await c.get(`/adAccounts/${account.ad_account_id}/adCampaigns`, { q: "search" });
    expect(capturedUrl).toContain("/rest/adAccounts/123456789/adCampaigns");
  });
});
