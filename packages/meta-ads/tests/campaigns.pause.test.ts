import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AuditLogger,
  ConfigManager,
  DryRunGate,
  RateLimiter,
  WriteDeniedError,
  callTool,
  type ToolContext,
} from "@manlikemuneeb/ads-mcp-core";
import { describe, expect, it } from "vitest";
import { tool as pauseTool } from "../src/tools/campaigns.pause.js";

function makeCtx(mode: "read" | "read_write", defaultDryRun: boolean): {
  ctx: ToolContext;
  fetchCalls: Array<{ url: string; method: string; body?: string }>;
  auditPath: string;
} {
  const config = ConfigManager.fromObject({
    version: 1 as const,
    default_dry_run: defaultDryRun,
    log_level: "info" as const,
    audit_log_path: join(mkdtempSync(join(tmpdir(), "ads-mcp-test-")), "audit.log"),
    platforms: {
      meta: {
        enabled: true,
        default_account: "primary",
        accounts: [
          {
            label: "primary",
            mode,
            ad_account_id: "act_999",
            token_ref: { kind: "inline" as const, value: "test-token" },
          },
        ],
      },
    },
  });

  const fetchCalls: Array<{ url: string; method: string; body?: string }> = [];
  const fakeFetch = async (url: string, init?: RequestInit) => {
    fetchCalls.push({ url, method: init?.method ?? "GET", body: init?.body as string | undefined });
    return new Response(JSON.stringify({ status: "ACTIVE" }), { status: 200 });
  };
  // Replace globalThis.fetch for this test scope
  globalThis.fetch = fakeFetch as typeof globalThis.fetch;

  const ctx: ToolContext = {
    config,
    rateLimiter: new RateLimiter(),
    auditLogger: new AuditLogger(config.getAuditLogPath()),
    dryRunGate: new DryRunGate(config),
  };
  return { ctx, fetchCalls, auditPath: config.getAuditLogPath() };
}

describe("meta.campaigns.pause", () => {
  it("dry-runs by default and does not POST", async () => {
    const { ctx, fetchCalls, auditPath } = makeCtx("read", true);
    const result = (await callTool(pauseTool, { campaign_id: "123" }, ctx)) as { outcome: string };
    expect(result.outcome).toBe("allow_dry_run");
    // First call is the GET preview; no POST expected
    expect(fetchCalls.some((c) => c.method === "POST")).toBe(false);
    await ctx.auditLogger.flush();
    const audit = readFileSync(auditPath, "utf8");
    expect(audit).toContain("allow_dry_run");
  });

  it("denies live write on read-only account", async () => {
    const { ctx } = makeCtx("read", true);
    await expect(
      callTool(pauseTool, { campaign_id: "123", dry_run: false }, ctx),
    ).rejects.toBeInstanceOf(WriteDeniedError);
  });

  it("performs live write when account is read_write and dry_run=false", async () => {
    const { ctx, fetchCalls } = makeCtx("read_write", true);
    const result = (await callTool(
      pauseTool,
      { campaign_id: "456", dry_run: false },
      ctx,
    )) as { outcome: string };
    expect(result.outcome).toBe("live_success");
    const post = fetchCalls.find((c) => c.method === "POST");
    expect(post).toBeDefined();
    expect(post?.body).toContain("PAUSED");
  });
});
