import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AuditLogger,
  ConfigManager,
  DryRunGate,
  RateLimiter,
  type ToolContext,
  checkNpmVersion,
} from "@manlikemuneeb/ads-mcp-core";
import { Ga4Client } from "@manlikemuneeb/ads-mcp-ga4";
import { GoogleAdsClient } from "@manlikemuneeb/ads-mcp-google-ads";
import { GscClient } from "@manlikemuneeb/ads-mcp-gsc";
import { LinkedInClient } from "@manlikemuneeb/ads-mcp-linkedin";
import { MetaClient } from "@manlikemuneeb/ads-mcp-meta";
import { runDriftChecks } from "./checkDrift.js";
import { closeRl, failure, header, info, success } from "./prompt.js";

export interface DoctorOptions {
  checkDrift?: boolean;
}

/**
 * Hit the npm registry and surface an upgrade nudge if a newer version is
 * published. Silently no-ops when the registry returns 404 (package not yet
 * published), the user is offline, or the request times out.
 */
async function checkAndAnnounceUpdate(): Promise<void> {
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const candidates = [
      resolve(__dirname, "..", "..", "..", "package.json"),
      resolve(__dirname, "..", "package.json"),
      resolve(process.cwd(), "package.json"),
    ];
    let pkg: { name?: string; version?: string } | null = null;
    for (const p of candidates) {
      try {
        pkg = JSON.parse(readFileSync(p, "utf8")) as { name?: string; version?: string };
        if (pkg.name && pkg.version) break;
      } catch {
        /* try next */
      }
    }
    if (!pkg?.name || !pkg.version) return;
    const result = await checkNpmVersion(pkg.name, pkg.version);
    if (result.update_available && result.latest_version) {
      header("Update available");
      info(`  Installed: ${result.installed_version}`);
      info(`  Latest published: ${result.latest_version}`);
      info(`  Run \`npm update ${pkg.name}\` (or reinstall the .plugin) to upgrade.`);
    }
  } catch {
    /* never block doctor on update advisory */
  }
}

export async function runDoctor(opts: DoctorOptions = {}): Promise<void> {
  header("ads-mcp doctor");

  let config: ConfigManager;
  try {
    config = ConfigManager.load();
  } catch (err) {
    failure(`Config load failed: ${err instanceof Error ? err.message : String(err)}`);
    info("Run `ads-mcp setup` to create a config.");
    process.exit(1);
  }
  success(`Config loaded from ${config.sourcePath}`);
  info(`  default_dry_run: ${config.getDefaultDryRun()}`);
  info(`  audit_log: ${config.getAuditLogPath()}`);

  const rateLimiter = new RateLimiter();
  const auditLogger = new AuditLogger(config.getAuditLogPath());
  const dryRunGate = new DryRunGate(config);
  const _ctx: ToolContext = { config, rateLimiter, auditLogger, dryRunGate };
  void _ctx;

  let ok = true;

  if (config.isPlatformEnabled("meta")) {
    header("Meta");
    for (const acct of config.listAccounts("meta")) {
      info(`  - ${acct.label} (${acct.mode}, ${acct.ad_account_id})`);
      try {
        const client = new MetaClient(acct, rateLimiter);
        const me = (await client.get("/me", { fields: "id" })) as { id?: string };
        if (me.id) success(`    auth ok (Meta user id: ${me.id})`);
        else failure(`    auth response missing id`);
      } catch (err) {
        ok = false;
        failure(`    ${(err as Error).message}`);
      }
    }
  }

  if (config.isPlatformEnabled("linkedin")) {
    header("LinkedIn");
    for (const acct of config.listAccounts("linkedin")) {
      info(`  - ${acct.label} (${acct.mode}, ${acct.ad_account_id})`);
      try {
        const client = new LinkedInClient(acct, rateLimiter);
        const a = (await client.get(`/adAccounts/${acct.ad_account_id}`)) as {
          id?: number;
          name?: string;
        };
        if (a.id) success(`    auth ok (account: ${a.name ?? a.id})`);
        else failure(`    auth response missing id`);
      } catch (err) {
        ok = false;
        failure(`    ${(err as Error).message}`);
      }
    }
  }

  if (config.isPlatformEnabled("google_ads")) {
    header("Google Ads");
    for (const acct of config.listAccounts("google_ads")) {
      info(`  - ${acct.label} (${acct.mode}, customer ${acct.customer_id})`);
      try {
        const client = new GoogleAdsClient(acct, rateLimiter);
        const res = (await client.search(
          "SELECT customer.id, customer.descriptive_name FROM customer LIMIT 1",
        )) as { results?: Array<{ customer?: { id?: string; descriptiveName?: string } }> };
        const c = res.results?.[0]?.customer;
        if (c?.id) success(`    auth ok (customer: ${c.descriptiveName ?? c.id})`);
        else failure(`    auth response missing customer`);
      } catch (err) {
        ok = false;
        failure(`    ${(err as Error).message}`);
      }
    }
  }

  if (config.isPlatformEnabled("ga4")) {
    header("GA4");
    for (const acct of config.listAccounts("ga4")) {
      info(`  - ${acct.label} (${acct.mode}, property ${acct.property_id})`);
      try {
        const client = new Ga4Client(acct, rateLimiter);
        const r = (await client.admin("GET", `/properties/${acct.property_id}`)) as {
          name?: string;
          displayName?: string;
        };
        if (r.name) success(`    auth ok (property: ${r.displayName ?? r.name})`);
        else failure(`    auth response missing name`);
      } catch (err) {
        ok = false;
        failure(`    ${(err as Error).message}`);
      }
    }
  }

  if (config.isPlatformEnabled("gsc")) {
    header("Google Search Console");
    for (const acct of config.listAccounts("gsc")) {
      info(`  - ${acct.label} (${acct.mode}, ${acct.site_url})`);
      try {
        const client = new GscClient(acct, rateLimiter);
        const r = (await client.webmasters("GET", "/sites")) as { siteEntry?: unknown[] };
        const count = r.siteEntry?.length ?? 0;
        success(`    auth ok (${count} sites accessible)`);
      } catch (err) {
        ok = false;
        failure(`    ${(err as Error).message}`);
      }
    }
  }

  // Optional drift check (Tier 2 self-update mechanism)
  if (opts.checkDrift) {
    header("Drift check (canonical request fixtures)");
    info(
      "Exercising each platform's pinned canonical request and comparing the response shape against the pinned schema.\n",
    );
    try {
      const reports = await runDriftChecks({ config, rateLimiter });
      const driftCount = reports.filter((r) => r.drift_detected).length;
      if (driftCount > 0) {
        ok = false;
        failure(
          `\n${driftCount} of ${reports.length} fixtures detected drift. See per-platform output above.`,
        );
      } else if (reports.length > 0) {
        success(`\nAll ${reports.length} canonical fixtures matched the pinned schemas.`);
      }
    } catch (err) {
      ok = false;
      failure(`Drift check failed: ${(err as Error).message}`);
    }
  }

  // Non-blocking npm-update advisory (Tier 3 self-update mechanism).
  await checkAndAnnounceUpdate();

  header("Result");
  if (ok) {
    success("All configured platforms reachable.");
    closeRl();
    process.exit(0);
  } else {
    failure("One or more platforms failed. See messages above.");
    closeRl();
    process.exit(1);
  }
}
