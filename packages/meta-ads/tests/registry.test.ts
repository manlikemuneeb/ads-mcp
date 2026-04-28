import { describe, expect, it } from "vitest";
import { metaTools } from "../src/registry.js";

describe("Meta tool registry", () => {
  const tools = metaTools();
  const names = tools.map((t) => t.name);

  it("registers all named read tools", () => {
    const reads = [
      // Entities
      "meta.account.overview",
      "meta.campaigns.list",
      "meta.adsets.list",
      "meta.ads.list",
      "meta.creatives.list",
      "meta.creatives.get",
      // Audiences / tracking / forms
      "meta.custom_audiences.list",
      "meta.pixels.list",
      "meta.custom_conversions.list",
      "meta.lead_gen_forms.list",
      "meta.lead_gen_forms.get_leads",
      // Insights
      "meta.insights.demographics",
      "meta.insights.placements",
      "meta.insights.creative",
      "meta.insights.funnel",
      "meta.insights.budget_pacing",
      "meta.insights.action_breakdown",
      // Planning / estimation
      "meta.delivery_estimate",
      "meta.targeting.search",
      "meta.targeting.account_search",
      "meta.targeting.browse",
    ];
    for (const name of reads) {
      expect(names, `read tool ${name} should be registered`).toContain(name);
    }
  });

  it("registers all named write tools", () => {
    const writes = [
      // Campaigns
      "meta.campaigns.create",
      "meta.campaigns.update",
      "meta.campaigns.pause",
      "meta.campaigns.resume",
      "meta.campaigns.update_budget",
      "meta.campaigns.delete",
      // Ad sets
      "meta.adsets.create",
      "meta.adsets.update",
      "meta.adsets.pause",
      "meta.adsets.resume",
      "meta.adsets.update_budget",
      "meta.adsets.delete",
      // Ads
      "meta.ads.create",
      "meta.ads.update",
      "meta.ads.pause",
      "meta.ads.resume",
      "meta.ads.delete",
      // Creatives / audiences / tracking
      "meta.creatives.create_image",
      "meta.custom_audiences.create_saved",
      "meta.custom_audiences.create_lookalike",
      "meta.custom_audiences.delete",
      "meta.custom_conversions.create",
    ];
    for (const name of writes) {
      expect(names, `write tool ${name} should be registered`).toContain(name);
    }
  });

  it("keeps the passthrough fallbacks registered", () => {
    expect(names).toContain("meta.passthrough.read");
    expect(names).toContain("meta.passthrough.write");
  });

  it("has no duplicate tool names", () => {
    expect(new Set(names).size, "duplicate tool names detected").toBe(names.length);
  });

  it("all write tools are tagged isWriteTool=true", () => {
    const writeNames = new Set([
      "meta.campaigns.create",
      "meta.campaigns.update",
      "meta.campaigns.pause",
      "meta.campaigns.resume",
      "meta.campaigns.update_budget",
      "meta.campaigns.delete",
      "meta.adsets.create",
      "meta.adsets.update",
      "meta.adsets.pause",
      "meta.adsets.resume",
      "meta.adsets.update_budget",
      "meta.adsets.delete",
      "meta.ads.create",
      "meta.ads.update",
      "meta.ads.pause",
      "meta.ads.resume",
      "meta.ads.delete",
      "meta.creatives.create_image",
      "meta.custom_audiences.create_saved",
      "meta.custom_audiences.create_lookalike",
      "meta.custom_audiences.delete",
      "meta.custom_conversions.create",
      "meta.passthrough.write",
    ]);
    for (const tool of tools) {
      if (writeNames.has(tool.name)) {
        expect(tool.isWriteTool, `${tool.name} should be isWriteTool=true`).toBe(true);
      }
    }
  });

  it("all read tools are tagged isWriteTool=false", () => {
    const readNames = new Set([
      "meta.account.overview",
      "meta.campaigns.list",
      "meta.adsets.list",
      "meta.ads.list",
      "meta.creatives.list",
      "meta.creatives.get",
      "meta.custom_audiences.list",
      "meta.pixels.list",
      "meta.custom_conversions.list",
      "meta.lead_gen_forms.list",
      "meta.lead_gen_forms.get_leads",
      "meta.insights.demographics",
      "meta.insights.placements",
      "meta.insights.creative",
      "meta.insights.funnel",
      "meta.insights.budget_pacing",
      "meta.insights.action_breakdown",
      "meta.delivery_estimate",
      "meta.targeting.search",
      "meta.targeting.account_search",
      "meta.targeting.browse",
      "meta.passthrough.read",
    ]);
    for (const tool of tools) {
      if (readNames.has(tool.name)) {
        expect(tool.isWriteTool, `${tool.name} should be isWriteTool=false`).toBe(
          false,
        );
      }
    }
  });

  it("total Meta tool count is the expected 45 (22 reads + 23 writes, both counts include their passthrough fallback)", () => {
    expect(tools.length).toBe(45);
  });
});
