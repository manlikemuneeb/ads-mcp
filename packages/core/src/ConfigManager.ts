import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import {
  type AdsMcpConfig,
  AdsMcpConfigSchema,
  ConfigError,
  type Ga4Property,
  type GoogleAdsAccount,
  type GscSite,
  type LinkedInAccount,
  type MetaAccount,
  type PlatformName,
} from "./types.js";

type AccountFor<P extends PlatformName> = P extends "meta"
  ? MetaAccount
  : P extends "linkedin"
    ? LinkedInAccount
    : P extends "google_ads"
      ? GoogleAdsAccount
      : P extends "ga4"
        ? Ga4Property
        : P extends "gsc"
          ? GscSite
          : never;

const DEFAULT_CONFIG_PATH = resolve(homedir(), ".ads-mcp", "config.json");

/**
 * ConfigManager loads, validates, and serves the ads-mcp configuration.
 *
 * Resolution order (no cache layer; this is by design):
 *   1. process.env.ADS_MCP_CONFIG (absolute path override)
 *   2. ~/.ads-mcp/config.json (default)
 *
 * If neither exists, throws ConfigError. Setup wizard (apps/cli) creates the
 * file at the default path.
 *
 * Use ConfigManager.load() to construct an instance once at server startup.
 * The instance is immutable: any config change requires a server restart.
 */
export class ConfigManager {
  private constructor(
    private readonly config: AdsMcpConfig,
    public readonly sourcePath: string,
  ) {}

  static load(overridePath?: string): ConfigManager {
    const path =
      overridePath ?? process.env.ADS_MCP_CONFIG ?? DEFAULT_CONFIG_PATH;

    if (!existsSync(path)) {
      throw new ConfigError(
        `Config file not found at ${path}. Run \`ads-mcp setup\` to create one.`,
      );
    }

    let raw: string;
    try {
      raw = readFileSync(path, "utf8");
    } catch (err) {
      throw new ConfigError(
        `Failed to read config file at ${path}: ${(err as Error).message}`,
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new ConfigError(
        `Config file at ${path} is not valid JSON: ${(err as Error).message}`,
      );
    }

    const result = AdsMcpConfigSchema.safeParse(parsed);
    if (!result.success) {
      const issues = result.error.issues
        .map((i) => `  - ${i.path.join(".") || "<root>"}: ${i.message}`)
        .join("\n");
      throw new ConfigError(`Config validation failed at ${path}:\n${issues}`);
    }

    return new ConfigManager(result.data, path);
  }

  /** Construct from an already-validated object. Useful in tests. */
  static fromObject(config: unknown, sourcePath = "<inline>"): ConfigManager {
    const result = AdsMcpConfigSchema.safeParse(config);
    if (!result.success) {
      const issues = result.error.issues
        .map((i) => `  - ${i.path.join(".") || "<root>"}: ${i.message}`)
        .join("\n");
      throw new ConfigError(`Inline config validation failed:\n${issues}`);
    }
    return new ConfigManager(result.data, sourcePath);
  }

  getRaw(): AdsMcpConfig {
    return this.config;
  }

  getDefaultDryRun(): boolean {
    return this.config.default_dry_run;
  }

  getAuditLogPath(): string {
    const path = this.config.audit_log_path;
    return path.startsWith("~") ? resolve(homedir(), path.slice(2)) : resolve(path);
  }

  getLogLevel(): AdsMcpConfig["log_level"] {
    return this.config.log_level;
  }

  isPlatformEnabled(platform: PlatformName): boolean {
    return this.config.platforms[platform]?.enabled ?? false;
  }

  listAccounts<P extends PlatformName>(platform: P): AccountFor<P>[] {
    const cfg = this.config.platforms[platform];
    if (!cfg) return [];
    return cfg.accounts as AccountFor<P>[];
  }

  getAccount<P extends PlatformName>(platform: P, label?: string): AccountFor<P> {
    const cfg = this.config.platforms[platform];
    if (!cfg) {
      throw new ConfigError(
        `Platform '${platform}' is not configured. Add it via \`ads-mcp setup\`.`,
      );
    }

    const targetLabel = label ?? cfg.default_account;
    const account = cfg.accounts.find((a) => a.label === targetLabel);
    if (!account) {
      const available = cfg.accounts.map((a) => `'${a.label}'`).join(", ");
      throw new ConfigError(
        `Account '${targetLabel}' not found for platform '${platform}'. Available: ${available}`,
      );
    }
    return account as AccountFor<P>;
  }

  getDefaultAccount<P extends PlatformName>(platform: P): AccountFor<P> {
    return this.getAccount(platform);
  }

  isWriteAllowed(platform: PlatformName, label?: string): boolean {
    try {
      const account = this.getAccount(platform, label);
      return account.mode === "read_write";
    } catch {
      return false;
    }
  }
}
