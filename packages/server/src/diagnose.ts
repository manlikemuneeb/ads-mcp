import { ConfigManager, RateLimiter, type PlatformName } from "@manlikemuneeb/ads-mcp-core";

export interface DiagnoseResult {
  config_source: string;
  default_dry_run: boolean;
  audit_log_path: string;
  platforms: Array<{
    name: PlatformName;
    enabled: boolean;
    account_count: number;
    accounts: Array<{ label: string; mode: "read" | "read_write" }>;
    rate_limit: { used: number; capacity: number; windowMs: number };
  }>;
}

const ALL_PLATFORMS: PlatformName[] = ["meta", "linkedin", "google_ads", "ga4", "gsc"];

export function diagnose(config: ConfigManager, limiter: RateLimiter): DiagnoseResult {
  const platforms = ALL_PLATFORMS.map((name) => {
    const enabled = config.isPlatformEnabled(name);
    const accounts = enabled
      ? config.listAccounts(name).map((a) => ({ label: a.label, mode: a.mode }))
      : [];
    const status = limiter.status(name);
    return {
      name,
      enabled,
      account_count: accounts.length,
      accounts,
      rate_limit: { used: status.used, capacity: status.capacity, windowMs: status.windowMs },
    };
  });
  return {
    config_source: config.sourcePath,
    default_dry_run: config.getDefaultDryRun(),
    audit_log_path: config.getAuditLogPath(),
    platforms,
  };
}
