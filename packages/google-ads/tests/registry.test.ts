import { describe, expect, it } from "vitest";
import { googleAdsTools } from "../src/registry.js";

describe("Google Ads tool registry", () => {
  const tools = googleAdsTools();
  const names = tools.map((t) => t.name);

  it("registers every named tool including ad_groups.list", () => {
    expect(names).toContain("google_ads.query");
    expect(names).toContain("google_ads.campaigns.list");
    expect(names).toContain("google_ads.ad_groups.list");
    expect(names).toContain("google_ads.campaigns.pause");
    expect(names).toContain("google_ads.campaigns.resume");
    expect(names).toContain("google_ads.campaigns.update_budget");
    expect(names).toContain("google_ads.passthrough.mutate");
  });

  it("has no duplicate tool names", () => {
    expect(new Set(names).size).toBe(names.length);
  });
});
