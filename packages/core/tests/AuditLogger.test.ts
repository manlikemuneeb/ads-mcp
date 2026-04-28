import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AuditLogger } from "../src/AuditLogger.js";

describe("AuditLogger", () => {
  it("writes one JSON line per entry", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ads-mcp-audit-"));
    const path = join(dir, "audit.log");
    const logger = new AuditLogger(path);

    await logger.log({
      tool: "meta.campaigns.pause",
      platform: "meta",
      account: "primary",
      params: { campaign_id: "123" },
      dry_run: true,
      outcome: "allow_dry_run",
      result_summary: "would pause 1",
    });
    await logger.log({
      tool: "meta.campaigns.resume",
      platform: "meta",
      account: "primary",
      params: { campaign_id: "456" },
      dry_run: false,
      outcome: "live_success",
    });
    await logger.flush();

    const contents = readFileSync(path, "utf8");
    const lines = contents.trim().split("\n");
    expect(lines).toHaveLength(2);

    const first = JSON.parse(lines[0]!);
    expect(first.tool).toBe("meta.campaigns.pause");
    expect(first.dry_run).toBe(true);
    expect(typeof first.ts).toBe("string");
    expect(first.ts).toMatch(/T\d\d:\d\d:\d\d/);

    const second = JSON.parse(lines[1]!);
    expect(second.outcome).toBe("live_success");
    expect(second.result_summary).toBeUndefined();
  });

  it("creates the log directory if it does not exist", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ads-mcp-audit-"));
    const path = join(dir, "nested", "deeper", "audit.log");
    const logger = new AuditLogger(path);
    await logger.log({
      tool: "x",
      platform: "meta",
      account: "primary",
      params: {},
      dry_run: true,
      outcome: "allow_dry_run",
    });
    await logger.flush();
    const contents = readFileSync(path, "utf8");
    expect(contents.length).toBeGreaterThan(0);
  });
});
