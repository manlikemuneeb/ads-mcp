import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  type CanonicalRequestFixture,
  type ConfigManager,
  type DriftReport,
  type RateLimiter,
  analyzeResponse,
  substituteFixture,
} from "@manlikemuneeb/ads-mcp-core";
import { Ga4Client } from "@manlikemuneeb/ads-mcp-ga4";
import { GoogleAdsClient } from "@manlikemuneeb/ads-mcp-google-ads";
import { GscClient } from "@manlikemuneeb/ads-mcp-gsc";
import { LinkedInClient } from "@manlikemuneeb/ads-mcp-linkedin";
import { MetaClient } from "@manlikemuneeb/ads-mcp-meta";
import { failure, header, info, success } from "./prompt.js";

/**
 * Resolve the path to a platform's fixture file. Different layouts in dev
 * (workspace symlinks) vs published vs .plugin bundle, so try a few paths.
 */
function findFixturePath(packageName: string, filename: string): string {
  const candidates = [
    // Workspace dev (cli's node_modules → workspace symlink → package fixtures)
    resolve(process.cwd(), "node_modules", packageName, "fixtures", filename),
    // Workspace dev (relative from cli/dist to sibling package)
    resolve(
      process.cwd(),
      "packages",
      packageName.replace("@manlikemuneeb/ads-mcp-", "").replace("google-ads", "google-ads"),
      "fixtures",
      filename,
    ),
    // .plugin bundle (resolved symlinks make this a real dir)
    resolve(process.cwd(), "node_modules", packageName, "fixtures", filename),
  ];
  for (const c of candidates) {
    try {
      readFileSync(c);
      return c;
    } catch {
      /* try next */
    }
  }
  throw new Error(
    `Could not find fixture ${filename} for ${packageName}. Looked in: ${candidates.join(", ")}`,
  );
}

function loadFixture(packageName: string, filename: string): CanonicalRequestFixture {
  const path = findFixturePath(packageName, filename);
  return JSON.parse(readFileSync(path, "utf8")) as CanonicalRequestFixture;
}

interface DriftRunInput {
  config: ConfigManager;
  rateLimiter: RateLimiter;
}

export async function runDriftChecks(input: DriftRunInput): Promise<DriftReport[]> {
  const { config, rateLimiter } = input;
  const reports: DriftReport[] = [];
  const today = new Date();
  const year = String(today.getUTCFullYear());
  const month = String(today.getUTCMonth() + 1);
  const dayEnd = String(Math.min(28, today.getUTCDate()));

  if (config.isPlatformEnabled("meta")) {
    header("Meta drift check");
    for (const acct of config.listAccounts("meta")) {
      const fixture = loadFixture("@manlikemuneeb/ads-mcp-meta", "canonical-request.json");
      const sub = substituteFixture(fixture, {
        AD_ACCOUNT_ID: acct.ad_account_id,
        YEAR: year,
        MONTH: month,
        DAY_END: dayEnd,
      });
      const client = new MetaClient(acct, rateLimiter);
      try {
        const result = await client.get(sub.endpoint, sub.params ?? {});
        const report = analyzeResponse(sub, result, "meta");
        reports.push(report);
        renderReport(report);
      } catch (err) {
        const report: DriftReport = {
          platform: "meta",
          fixture_name: sub.name,
          ok: false,
          drift_detected: true,
          expected_response_keys: sub.expected_response_keys,
          actual_response_keys: [],
          missing_keys: sub.expected_response_keys,
          unexpected_response: true,
          error: (err as Error).message,
          doc_url: sub.doc_url,
          pinned_api_version: sub.pinned_api_version,
          recommendation: `Request failed entirely: ${(err as Error).message}. Either auth issue or endpoint moved. Check ${sub.doc_url}.`,
        };
        reports.push(report);
        renderReport(report);
      }
    }
  }

  if (config.isPlatformEnabled("linkedin")) {
    header("LinkedIn drift check");
    for (const acct of config.listAccounts("linkedin")) {
      const fixture = loadFixture("@manlikemuneeb/ads-mcp-linkedin", "canonical-request.json");
      const sub = substituteFixture(fixture, {
        AD_ACCOUNT_ID: acct.ad_account_id,
        YEAR: year,
        MONTH: month,
        DAY_END: dayEnd,
      });
      const client = new LinkedInClient(acct, rateLimiter);
      try {
        const result = await client.get(sub.endpoint, sub.params ?? {});
        const report = analyzeResponse(sub, result, "linkedin");
        reports.push(report);
        renderReport(report);
      } catch (err) {
        reports.push(buildErrorReport("linkedin", sub, err as Error));
        renderReport(reports[reports.length - 1]!);
      }
    }
  }

  if (config.isPlatformEnabled("google_ads")) {
    header("Google Ads drift check");
    for (const acct of config.listAccounts("google_ads")) {
      const fixture = loadFixture("@manlikemuneeb/ads-mcp-google-ads", "canonical-request.json");
      const sub = substituteFixture(fixture, { CUSTOMER_ID: acct.customer_id });
      const client = new GoogleAdsClient(acct, rateLimiter);
      try {
        const result = await client.search(
          (sub.body?.query as string) ?? "SELECT customer.id FROM customer LIMIT 1",
        );
        const report = analyzeResponse(sub, result, "google_ads");
        reports.push(report);
        renderReport(report);
      } catch (err) {
        reports.push(buildErrorReport("google_ads", sub, err as Error));
        renderReport(reports[reports.length - 1]!);
      }
    }
  }

  if (config.isPlatformEnabled("ga4")) {
    header("GA4 drift check");
    for (const property of config.listAccounts("ga4")) {
      const fixture = loadFixture("@manlikemuneeb/ads-mcp-ga4", "canonical-request.json");
      const sub = substituteFixture(fixture, { PROPERTY_ID: property.property_id });
      const client = new Ga4Client(property, rateLimiter);
      try {
        const result = await client.admin("GET", sub.endpoint);
        const report = analyzeResponse(sub, result, "ga4");
        reports.push(report);
        renderReport(report);
      } catch (err) {
        reports.push(buildErrorReport("ga4", sub, err as Error));
        renderReport(reports[reports.length - 1]!);
      }
    }
  }

  if (config.isPlatformEnabled("gsc")) {
    header("GSC drift check");
    for (const site of config.listAccounts("gsc")) {
      const fixture = loadFixture("@manlikemuneeb/ads-mcp-gsc", "canonical-request.json");
      const client = new GscClient(site, rateLimiter);
      try {
        const result = await client.webmasters("GET", fixture.endpoint);
        const report = analyzeResponse(fixture, result, "gsc");
        reports.push(report);
        renderReport(report);
      } catch (err) {
        reports.push(buildErrorReport("gsc", fixture, err as Error));
        renderReport(reports[reports.length - 1]!);
      }
    }
  }

  return reports;
}

function buildErrorReport(
  platform: import("@manlikemuneeb/ads-mcp-core").PlatformName,
  fixture: CanonicalRequestFixture,
  err: Error,
): DriftReport {
  return {
    platform,
    fixture_name: fixture.name,
    ok: false,
    drift_detected: true,
    expected_response_keys: fixture.expected_response_keys,
    actual_response_keys: [],
    missing_keys: fixture.expected_response_keys,
    unexpected_response: true,
    error: err.message,
    doc_url: fixture.doc_url,
    pinned_api_version: fixture.pinned_api_version,
    recommendation: `Request failed: ${err.message}. Either auth, scope, or endpoint moved. Check ${fixture.doc_url}.`,
  };
}

function renderReport(report: DriftReport): void {
  const tag = `${report.platform}/${report.fixture_name}`;
  if (report.ok) {
    success(`  ${tag}: response shape matches pinned schema (api ${report.pinned_api_version})`);
    return;
  }
  failure(`  ${tag}: DRIFT DETECTED`);
  if (report.error) info(`    error: ${report.error}`);
  if (report.missing_keys.length > 0) {
    info(`    missing keys: ${report.missing_keys.join(", ")}`);
  }
  if (report.actual_response_keys.length > 0) {
    info(`    actual keys: ${report.actual_response_keys.slice(0, 8).join(", ")}`);
  }
  if (report.recommendation) info(`    fix: ${report.recommendation}`);
  info(`    doc: ${report.doc_url}`);
}
