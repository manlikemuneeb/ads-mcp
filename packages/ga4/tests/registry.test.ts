import { describe, expect, it } from "vitest";
import { ga4Tools } from "../src/registry.js";

describe("GA4 tool registry", () => {
  const tools = ga4Tools();
  const names = tools.map((t) => t.name);

  it("registers reads, including the new admin write tools", () => {
    // Reads
    expect(names).toContain("ga4.report.run");
    expect(names).toContain("ga4.accounts.list");
    expect(names).toContain("ga4.properties.list");
    expect(names).toContain("ga4.custom_dimensions.list");
    expect(names).toContain("ga4.custom_metrics.list");
    // Writes (incl. new ones from this sprint)
    expect(names).toContain("ga4.conversion_events.create");
    expect(names).toContain("ga4.conversion_events.delete");
    expect(names).toContain("ga4.custom_dimensions.create");
    expect(names).toContain("ga4.custom_metrics.create");
    // Fallback
    expect(names).toContain("ga4.passthrough.read");
    expect(names).toContain("ga4.passthrough.write");
  });

  it("has no duplicate tool names", () => {
    expect(new Set(names).size).toBe(names.length);
  });
});
