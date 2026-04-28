import { describe, expect, it } from "vitest";
import { ConfigManager } from "../src/ConfigManager.js";
import { DryRunGate } from "../src/DryRunGate.js";
import { WriteDeniedError } from "../src/types.js";

const buildConfig = (mode: "read" | "read_write", defaultDryRun: boolean) => ({
  version: 1 as const,
  default_dry_run: defaultDryRun,
  log_level: "info" as const,
  audit_log_path: "~/.ads-mcp/audit.log",
  platforms: {
    meta: {
      enabled: true,
      default_account: "primary",
      accounts: [
        {
          label: "primary",
          mode,
          ad_account_id: "act_123",
          token_ref: { kind: "env" as const, var: "META_TOKEN" },
        },
      ],
    },
  },
});

describe("DryRunGate", () => {
  it("read tools always pass through", () => {
    const cm = ConfigManager.fromObject(buildConfig("read", true));
    const gate = new DryRunGate(cm);
    const decision = gate.evaluate({
      toolName: "meta.campaigns.list",
      platform: "meta",
      accountLabel: "primary",
      isWriteTool: false,
    });
    expect(decision.outcome).toBe("allow_read");
  });

  it("write tool with dry_run=true returns allow_dry_run", () => {
    const cm = ConfigManager.fromObject(buildConfig("read", true));
    const gate = new DryRunGate(cm);
    const decision = gate.evaluate({
      toolName: "meta.campaigns.pause",
      platform: "meta",
      accountLabel: "primary",
      isWriteTool: true,
      dryRunRequested: true,
    });
    expect(decision.outcome).toBe("allow_dry_run");
    expect(decision.effectiveDryRun).toBe(true);
  });

  it("write tool with dry_run=false on read-only account is denied", () => {
    const cm = ConfigManager.fromObject(buildConfig("read", true));
    const gate = new DryRunGate(cm);
    expect(() =>
      gate.evaluate({
        toolName: "meta.campaigns.pause",
        platform: "meta",
        accountLabel: "primary",
        isWriteTool: true,
        dryRunRequested: false,
      }),
    ).toThrow(WriteDeniedError);
  });

  it("write tool with dry_run=false on read_write account is allowed live", () => {
    const cm = ConfigManager.fromObject(buildConfig("read_write", true));
    const gate = new DryRunGate(cm);
    const decision = gate.evaluate({
      toolName: "meta.campaigns.pause",
      platform: "meta",
      accountLabel: "primary",
      isWriteTool: true,
      dryRunRequested: false,
    });
    expect(decision.outcome).toBe("allow_live");
  });

  it("write tool with omitted dry_run uses config default", () => {
    const cm = ConfigManager.fromObject(buildConfig("read_write", true));
    const gate = new DryRunGate(cm);
    const decision = gate.evaluate({
      toolName: "meta.campaigns.pause",
      platform: "meta",
      accountLabel: "primary",
      isWriteTool: true,
    });
    expect(decision.outcome).toBe("allow_dry_run");
  });

  it("write tool with omitted dry_run + default false + read_write goes live", () => {
    const cm = ConfigManager.fromObject(buildConfig("read_write", false));
    const gate = new DryRunGate(cm);
    const decision = gate.evaluate({
      toolName: "meta.campaigns.pause",
      platform: "meta",
      accountLabel: "primary",
      isWriteTool: true,
    });
    expect(decision.outcome).toBe("allow_live");
  });
});
