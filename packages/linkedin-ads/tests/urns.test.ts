import { describe, expect, it } from "vitest";
import { inlineDateRange, isoToLinkedInDate, sponsoredAccountUrn } from "../src/urns.js";

describe("LinkedIn URN helpers", () => {
  it("builds sponsoredAccount URN", () => {
    expect(sponsoredAccountUrn("123")).toBe("urn:li:sponsoredAccount:123");
  });

  it("parses ISO dates", () => {
    expect(isoToLinkedInDate("2026-04-01")).toEqual({ year: 2026, month: 4, day: 1 });
  });

  it("rejects malformed ISO dates", () => {
    expect(() => isoToLinkedInDate("2026-4-1")).toThrow();
    expect(() => isoToLinkedInDate("April 1, 2026")).toThrow();
  });

  it("formats inline date range", () => {
    expect(inlineDateRange("2026-04-01", "2026-04-30")).toBe(
      "(start:(year:2026,month:4,day:1),end:(year:2026,month:4,day:30))",
    );
  });
});
