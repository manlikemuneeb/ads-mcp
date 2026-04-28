import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AuditLogger,
  ConfigManager,
  DEFAULT_DOC_PAGES,
  DryRunGate,
  RateLimiter,
  type ToolContext,
  checkDocPages,
  checkNpmVersion,
  formatDriftSummary,
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
 * When a platform call fails, classify the error message to decide whether
 * a stale credential is the likely cause. We trigger on the strings the
 * platforms actually return:
 *   LinkedIn  → "token has been revoked"
 *   Meta      → "OAuthException", "expired", "Invalid OAuth", "session has expired"
 *   Google    → "invalid_grant", "Invalid Credentials", "401", "Token has been expired"
 *   GA4 / GSC → same Google substrings
 *   Anyone    → bare "401" status surfaced through our wrapped error
 */
function isLikelyAuthError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("revoked") ||
    m.includes("expired") ||
    m.includes("invalid_grant") ||
    m.includes("invalid oauth") ||
    m.includes("invalid credentials") ||
    m.includes("invalid_client") ||
    m.includes("oauthexception") ||
    m.includes("session has expired") ||
    m.includes("(401)") ||
    /\b401\b/.test(m)
  );
}

/**
 * Print a follow-up hint when a platform call looked like an auth failure.
 * Tells the user the exact command to re-authorize that account.
 */
function authHint(
  platform: "meta" | "linkedin" | "google" | "ga4" | "gsc",
  label: string,
  message: string,
): void {
  if (!isLikelyAuthError(message)) return;
  const oauthArg =
    platform === "ga4" || platform === "gsc" ? "google" : platform;
  info(
    `      → Likely a stale or revoked credential. Re-authorize the '${label}' account with:`,
  );
  info(`        ads-mcp setup --oauth ${oauthArg}`);
  if (platform === "linkedin" || platform === "meta") {
    info(
      "        (Use the same account label '" +
        label +
        "' to overwrite the existing entry.)",
    );
  }
  if (platform === "ga4" || platform === "gsc" || platform === "google") {
    info(
      "        (Google Ads / GA4 / GSC share one OAuth identity; one re-auth covers all three.)",
    );
  }
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
        const msg = (err as Error).message;
        failure(`    ${msg}`);
        authHint("meta", acct.label, msg);
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
        const msg = (err as Error).message;
        failure(`    ${msg}`);
        authHint("linkedin", acct.label, msg);
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
        const msg = (err as Error).message;
        failure(`    ${msg}`);
        authHint("google", acct.label, msg);
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
        const msg = (err as Error).message;
        failure(`    ${msg}`);
        authHint("ga4", acct.label, msg);
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
        const msg = (err as Error).message;
        failure(`    ${msg}`);
        authHint("gsc", acct.label, msg);
      }
    }
  }

  // Optional drift checks (Tier 2 + Tier 4 self-update mechanism)
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

    header("Doc-page drift check");
    info(
      "Fetching each registered platform documentation page and comparing against ~/.ads-mcp/doc-state.json.\n",
    );
    try {
      const { results: docResults } = await checkDocPages(DEFAULT_DOC_PAGES);
      info(formatDriftSummary(docResults));
      const docChanged = docResults.filter((r) => r.status === "changed").length;
      if (docChanged > 0) {
        ok = false;
        failure(
          `\n${docChanged} doc page${docChanged === 1 ? "" : "s"} changed since last check. Review the indicated fixtures/manifests.`,
        );
      } else {
        const baselineCount = docResults.filter((r) => r.status === "baseline").length;
        if (baselineCount === docResults.length) {
          success(`\nBaseline established for ${baselineCount} doc pages.`);
        } else if (baselineCount > 0) {
          info(
            `\n${baselineCount} new doc pages added to baseline; the rest matched their last-seen hash.`,
          );
        } else {
          success("\nAll doc pages match their last-seen baseline.");
        }
      }
    } catch (err) {
      info(`Doc-page drift check failed (non-blocking): ${(err as Error).message}`);
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
