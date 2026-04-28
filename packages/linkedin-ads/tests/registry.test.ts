import { describe, expect, it } from "vitest";
import { linkedinTools } from "../src/registry.js";

describe("LinkedIn tool registry", () => {
  const tools = linkedinTools();
  const names = tools.map((t) => t.name);

  it("registers every named read tool", () => {
    expect(names).toContain("linkedin.account.overview");
    expect(names).toContain("linkedin.campaigns.list");
    expect(names).toContain("linkedin.analytics");
    expect(names).toContain("linkedin.creatives.list");
  });

  it("registers every named write tool", () => {
    expect(names).toContain("linkedin.campaigns.pause");
    expect(names).toContain("linkedin.campaigns.resume");
    expect(names).toContain("linkedin.campaigns.update_budget");
    expect(names).toContain("linkedin.creatives.pause");
    expect(names).toContain("linkedin.creatives.resume");
  });

  it("keeps passthrough fallbacks registered", () => {
    expect(names).toContain("linkedin.passthrough.read");
    expect(names).toContain("linkedin.passthrough.write");
  });

  it("has no duplicate tool names", () => {
    expect(new Set(names).size).toBe(names.length);
  });
});
