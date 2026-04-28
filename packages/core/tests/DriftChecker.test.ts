import { describe, expect, it } from "vitest";
import {
  type CanonicalRequestFixture,
  analyzeResponse,
  substituteFixture,
} from "../src/DriftChecker.js";

const baseFixture: CanonicalRequestFixture = {
  platform: "linkedin",
  name: "test_fixture",
  method: "GET",
  endpoint: "/adAnalytics",
  params: {
    accounts: "List(urn%3Ali%3AsponsoredAccount%3A{{AD_ACCOUNT_ID}})",
    year: "{{YEAR}}",
  },
  expected_response_keys: ["elements", "paging"],
  doc_url: "https://docs.example.com",
  doc_version: "v1",
  pinned_api_version: "v1",
  description: "test",
};

describe("substituteFixture", () => {
  it("substitutes placeholders in params", () => {
    const sub = substituteFixture(baseFixture, { AD_ACCOUNT_ID: "123", YEAR: "2026" });
    expect(sub.params?.accounts).toBe("List(urn%3Ali%3AsponsoredAccount%3A123)");
    expect(sub.params?.year).toBe("2026");
  });

  it("leaves unmatched placeholders as-is for visibility in errors", () => {
    const sub = substituteFixture(baseFixture, { AD_ACCOUNT_ID: "123" });
    expect(sub.params?.year).toBe("{{YEAR}}");
  });

  it("substitutes placeholders in endpoint paths", () => {
    const f: CanonicalRequestFixture = {
      ...baseFixture,
      endpoint: "/properties/{{PROPERTY_ID}}",
      params: undefined,
    };
    const sub = substituteFixture(f, { PROPERTY_ID: "999" });
    expect(sub.endpoint).toBe("/properties/999");
  });
});

describe("analyzeResponse", () => {
  it("reports ok when all expected keys are present", () => {
    const r = analyzeResponse(baseFixture, { elements: [], paging: { total: 0 } }, "linkedin");
    expect(r.ok).toBe(true);
    expect(r.drift_detected).toBe(false);
    expect(r.missing_keys).toEqual([]);
  });

  it("flags missing keys", () => {
    const r = analyzeResponse(baseFixture, { elements: [] }, "linkedin");
    expect(r.ok).toBe(false);
    expect(r.drift_detected).toBe(true);
    expect(r.missing_keys).toEqual(["paging"]);
    expect(r.recommendation).toContain("paging");
  });

  it("flags non-object response", () => {
    const r = analyzeResponse(baseFixture, "unexpected string", "linkedin");
    expect(r.ok).toBe(false);
    expect(r.unexpected_response).toBe(true);
    expect(r.recommendation).toContain("not a JSON object");
  });

  it("flags array response (not the expected envelope)", () => {
    const r = analyzeResponse(baseFixture, [{}, {}], "linkedin");
    expect(r.ok).toBe(false);
    expect(r.unexpected_response).toBe(true);
  });

  it("includes doc_url and pinned_api_version in the report", () => {
    const r = analyzeResponse(baseFixture, { elements: [], paging: {} }, "linkedin");
    expect(r.doc_url).toBe("https://docs.example.com");
    expect(r.pinned_api_version).toBe("v1");
  });
});
