// TECH-DEBT(option-c-tool-quality): tokens stored inline in config.json. Phase 2 moves to OS keychain.
import { mkdir, writeFile, chmod } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import {
  type AdsMcpConfig,
  AdsMcpConfigSchema,
  type Ga4Property,
  type GoogleAdsAccount,
  type GscSite,
  type LinkedInAccount,
  type MetaAccount,
} from "@manlikemuneeb/ads-mcp-core";
import {
  ask,
  askChoice,
  askOptional,
  askSecret,
  askYesNo,
  closeRl,
  failure,
  header,
  info,
  success,
} from "./prompt.js";
import {
  smokeGa4,
  smokeGoogleAds,
  smokeGsc,
  smokeLinkedIn,
  smokeMeta,
  type SmokeResult,
} from "./smoke.js";

const DEFAULT_CONFIG_PATH = resolve(homedir(), ".ads-mcp", "config.json");

export async function runSetup(): Promise<void> {
  info("ads-mcp setup wizard");
  info("This walks through enabling each ad platform and saving credentials.");
  info(`Config will be written to: ${DEFAULT_CONFIG_PATH}`);
  info("Tokens are stored inline in this file (chmod 600). Phase 2 will move to OS keychain.");
  info("Heads up: token input is NOT masked in this v1 wizard. Tokens will be visible as you paste.");
  info("Each account is smoke-tested live before being saved, so bad credentials are caught immediately.\n");

  const platforms: AdsMcpConfig["platforms"] = {};

  if (await askYesNo("Configure Meta Ads (Facebook/Instagram)?", true)) {
    platforms.meta = await setupMeta();
  }
  if (await askYesNo("Configure LinkedIn Ads?", true)) {
    platforms.linkedin = await setupLinkedIn();
  }
  if (await askYesNo("Configure Google Ads?", true)) {
    platforms.google_ads = await setupGoogleAds();
  }
  if (await askYesNo("Configure GA4 (Google Analytics 4)?", true)) {
    platforms.ga4 = await setupGa4();
  }
  if (await askYesNo("Configure Google Search Console?", true)) {
    platforms.gsc = await setupGsc();
  }

  header("Global settings");
  const defaultDryRun = await askYesNo(
    "Default dry-run for write tools? (recommended for first install)",
    true,
  );

  const config: AdsMcpConfig = {
    version: 1,
    default_dry_run: defaultDryRun,
    log_level: "info",
    audit_log_path: "~/.ads-mcp/audit.log",
    platforms,
  };

  const result = AdsMcpConfigSchema.safeParse(config);
  if (!result.success) {
    failure("Generated config failed validation. This is a bug. Reporting and aborting.");
    failure(JSON.stringify(result.error.issues, null, 2));
    closeRl();
    process.exit(1);
  }

  await mkdir(resolve(homedir(), ".ads-mcp"), { recursive: true });
  await writeFile(DEFAULT_CONFIG_PATH, JSON.stringify(result.data, null, 2), "utf8");
  await chmod(DEFAULT_CONFIG_PATH, 0o600);

  header("Done");
  success(`Config written to ${DEFAULT_CONFIG_PATH}`);
  info("\nNext steps:");
  info("  1. Run `ads-mcp doctor` to re-verify each platform connects.");
  info("  2. Wire ads-mcp into your AI client. See examples/mcp-snippets/ for snippets.");
  info("  3. Set per-account `mode: \"read_write\"` in the config when ready to allow writes.");
  closeRl();
}

// --- Validation helper -------------------------------------------------------

/**
 * Run a smoke test and let the user retry, save anyway, or drop the account.
 * Returns `true` if the account should be saved, `false` if it should be dropped.
 * Returns `"retry"` if the user wants to re-enter credentials.
 */
async function handleSmoke(result: SmokeResult): Promise<true | false | "retry"> {
  if (result.ok) {
    success(`  ${result.summary}`);
    return true;
  }
  failure(`  Smoke test failed: ${result.error}`);
  const choice = await askChoice(
    "  What now?",
    ["retry", "save_anyway", "drop"] as const,
    "retry",
  );
  if (choice === "retry") return "retry";
  if (choice === "save_anyway") return true;
  return false;
}

// --- Per-platform setup -------------------------------------------------------

async function commonAccount(): Promise<{ label: string; mode: "read" | "read_write" }> {
  const label = await ask("  Account label", "primary");
  const mode = await askChoice("  Mode", ["read", "read_write"] as const, "read");
  return { label, mode };
}

async function setupMeta() {
  header("Meta Ads");
  const accounts: MetaAccount[] = [];
  outer: while (true) {
    while (true) {
      const { label, mode } = await commonAccount();
      let id = await ask("  ad_account_id (with or without 'act_' prefix)");
      if (!id.startsWith("act_")) id = `act_${id}`;
      const token = await askSecret("  Access token (long-lived)");
      const account: MetaAccount = {
        label,
        mode,
        ad_account_id: id,
        token_ref: { kind: "inline" as const, value: token },
      };
      info("  Testing credentials...");
      const decision = await handleSmoke(await smokeMeta(account));
      if (decision === "retry") continue;
      if (decision === true) accounts.push(account);
      break;
    }
    if (!(await askYesNo("Add another Meta account?", false))) break outer;
  }
  if (accounts.length === 0) {
    info("  No Meta accounts saved.");
    return undefined;
  }
  return {
    enabled: true,
    default_account: accounts[0]!.label,
    accounts,
  };
}

async function setupLinkedIn() {
  header("LinkedIn Ads");
  const accounts: LinkedInAccount[] = [];
  outer: while (true) {
    while (true) {
      const { label, mode } = await commonAccount();
      const id = await ask("  ad_account_id (numeric)");
      const token = await askSecret("  Access token");
      const account: LinkedInAccount = {
        label,
        mode,
        ad_account_id: id,
        token_ref: { kind: "inline" as const, value: token },
      };
      info("  Testing credentials...");
      const decision = await handleSmoke(await smokeLinkedIn(account));
      if (decision === "retry") continue;
      if (decision === true) accounts.push(account);
      break;
    }
    if (!(await askYesNo("Add another LinkedIn account?", false))) break outer;
  }
  if (accounts.length === 0) return undefined;
  return { enabled: true, default_account: accounts[0]!.label, accounts };
}

async function setupGoogleAds() {
  header("Google Ads");
  info("  Need: developer_token from Google Ads UI > Tools > API Center,");
  info("        and an authorized_user credentials.json (client_id+secret+refresh_token).");
  const accounts: GoogleAdsAccount[] = [];
  outer: while (true) {
    while (true) {
      const { label, mode } = await commonAccount();
      const customerId = (await ask("  customer_id (no dashes)")).replace(/-/g, "");
      const loginRaw = await askOptional("  login_customer_id (manager id, no dashes)");
      const developerToken = await askSecret("  developer_token");
      const credsPath = await ask("  Path to OAuth credentials.json (absolute)");
      const account: GoogleAdsAccount = {
        label,
        mode,
        customer_id: customerId,
        developer_token_ref: { kind: "inline" as const, value: developerToken },
        oauth_credentials_ref: { kind: "file" as const, path: credsPath },
        ...(loginRaw ? { login_customer_id: loginRaw.replace(/-/g, "") } : {}),
      };
      info("  Testing credentials...");
      const decision = await handleSmoke(await smokeGoogleAds(account));
      if (decision === "retry") continue;
      if (decision === true) accounts.push(account);
      break;
    }
    if (!(await askYesNo("Add another Google Ads account?", false))) break outer;
  }
  if (accounts.length === 0) return undefined;
  return { enabled: true, default_account: accounts[0]!.label, accounts };
}

async function setupGa4() {
  header("GA4");
  info("  Need: GA4 property_id and an authorized_user credentials.json with analytics scopes.");
  const accounts: Ga4Property[] = [];
  outer: while (true) {
    while (true) {
      const { label, mode } = await commonAccount();
      const propertyId = await ask("  property_id (numeric)");
      const credsPath = await ask("  Path to OAuth credentials.json (absolute; can reuse Google Ads file)");
      const account: Ga4Property = {
        label,
        mode,
        property_id: propertyId,
        oauth_credentials_ref: { kind: "file" as const, path: credsPath },
      };
      info("  Testing credentials...");
      const decision = await handleSmoke(await smokeGa4(account));
      if (decision === "retry") continue;
      if (decision === true) accounts.push(account);
      break;
    }
    if (!(await askYesNo("Add another GA4 property?", false))) break outer;
  }
  if (accounts.length === 0) return undefined;
  return { enabled: true, default_account: accounts[0]!.label, accounts };
}

async function setupGsc() {
  header("Google Search Console");
  info("  Need: site_url and an authorized_user credentials.json with webmasters scope.");
  const accounts: GscSite[] = [];
  outer: while (true) {
    while (true) {
      const { label, mode } = await commonAccount();
      const siteUrl = await ask("  site_url ('https://example.com/' or 'sc-domain:example.com')");
      const credsPath = await ask("  Path to OAuth credentials.json (absolute; can reuse Google Ads file)");
      const account: GscSite = {
        label,
        mode,
        site_url: siteUrl,
        oauth_credentials_ref: { kind: "file" as const, path: credsPath },
      };
      info("  Testing credentials...");
      const decision = await handleSmoke(await smokeGsc(account));
      if (decision === "retry") continue;
      if (decision === true) accounts.push(account);
      break;
    }
    if (!(await askYesNo("Add another GSC site?", false))) break outer;
  }
  if (accounts.length === 0) return undefined;
  return { enabled: true, default_account: accounts[0]!.label, accounts };
}
