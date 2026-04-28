import { describe, expect, it } from "vitest";
import { ConfigManager } from "../src/ConfigManager.js";
import { ConfigError } from "../src/types.js";

const MIN_VALID_CONFIG = {
  version: 1 as const,
  default_dry_run: true,
  log_level: "info" as const,
  audit_log_path: "~/.ads-mcp/audit.log",
  platforms: {
    meta: {
      enabled: true,
      default_account: "primary",
      accounts: [
        {
          label: "primary",
          mode: "read" as const,
          ad_account_id: "act_123",
          token_ref: { kind: "env" as const, var: "META_TOKEN" },
        },
      ],
    },
  },
};

describe("ConfigManager", () => {
  it("loads a valid inline config", () => {
    const cm = ConfigManager.fromObject(MIN_VALID_CONFIG);
    expect(cm.isPlatformEnabled("meta")).toBe(true);
    expect(cm.isPlatformEnabled("linkedin")).toBe(false);
  });

  it("returns the default account when label is omitted", () => {
    const cm = ConfigManager.fromObject(MIN_VALID_CONFIG);
    const acct = cm.getDefaultAccount("meta");
    expect(acct.label).toBe("primary");
    expect(acct.ad_account_id).toBe("act_123");
  });

  it("throws when account label does not exist", () => {
    const cm = ConfigManager.fromObject(MIN_VALID_CONFIG);
    expect(() => cm.getAccount("meta", "nonexistent")).toThrow(ConfigError);
  });

  it("isWriteAllowed reflects account mode", () => {
    const cm = ConfigManager.fromObject(MIN_VALID_CONFIG);
    expect(cm.isWriteAllowed("meta", "primary")).toBe(false);

    const cm2 = ConfigManager.fromObject({
      ...MIN_VALID_CONFIG,
      platforms: {
        meta: {
          ...MIN_VALID_CONFIG.platforms.meta,
          accounts: [{ ...MIN_VALID_CONFIG.platforms.meta.accounts[0]!, mode: "read_write" as const }],
        },
      },
    });
    expect(cm2.isWriteAllowed("meta", "primary")).toBe(true);
  });

  it("rejects invalid config", () => {
    expect(() =>
      ConfigManager.fromObject({
        version: 1,
        platforms: { meta: { enabled: true, default_account: "x", accounts: [] } },
      }),
    ).toThrow(ConfigError);
  });

  it("reports unknown platforms cleanly", () => {
    const cm = ConfigManager.fromObject(MIN_VALID_CONFIG);
    expect(() => cm.getAccount("linkedin")).toThrow(ConfigError);
  });

  it("expands ~/ in audit_log_path", () => {
    const cm = ConfigManager.fromObject(MIN_VALID_CONFIG);
    const path = cm.getAuditLogPath();
    expect(path.startsWith("~")).toBe(false);
    expect(path.endsWith(".ads-mcp/audit.log")).toBe(true);
  });
});
