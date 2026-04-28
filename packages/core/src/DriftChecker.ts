import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { PlatformName } from "./types.js";

export interface CanonicalRequestFixture {
  platform: string;
  name: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  api?: "data" | "admin";
  endpoint: string;
  params?: Record<string, string>;
  body?: Record<string, unknown>;
  expected_response_keys: string[];
  expected_first_element_keys?: string[];
  doc_url: string;
  doc_version: string;
  pinned_api_version: string;
  description: string;
}

export interface DriftReport {
  platform: PlatformName;
  fixture_name: string;
  ok: boolean;
  drift_detected: boolean;
  expected_response_keys: string[];
  actual_response_keys: string[];
  missing_keys: string[];
  unexpected_response: boolean;
  error?: string;
  doc_url: string;
  pinned_api_version: string;
  recommendation?: string;
}

/**
 * Substitute placeholders in fixture endpoint and params using values from the
 * user's account context. Placeholders use double-brace syntax: {{AD_ACCOUNT_ID}}.
 */
export function substituteFixture(
  fixture: CanonicalRequestFixture,
  values: Record<string, string>,
): CanonicalRequestFixture {
  const sub = (s: string): string =>
    s.replace(/\{\{(\w+)\}\}/g, (_, k) => values[k] ?? `{{${k}}}`);
  const out: CanonicalRequestFixture = {
    ...fixture,
    endpoint: sub(fixture.endpoint),
  };
  if (fixture.params) {
    out.params = Object.fromEntries(Object.entries(fixture.params).map(([k, v]) => [k, sub(v)]));
  }
  return out;
}

/** Compare expected response keys against actual keys, return drift report. */
export function analyzeResponse(
  fixture: CanonicalRequestFixture,
  actual: unknown,
  platform: PlatformName,
): DriftReport {
  const isObject = typeof actual === "object" && actual !== null && !Array.isArray(actual);
  const actualKeys = isObject ? Object.keys(actual as Record<string, unknown>) : [];
  const missingKeys = fixture.expected_response_keys.filter((k) => !actualKeys.includes(k));
  const unexpectedResponse = !isObject;
  const driftDetected = unexpectedResponse || missingKeys.length > 0;

  const report: DriftReport = {
    platform,
    fixture_name: fixture.name,
    ok: !driftDetected,
    drift_detected: driftDetected,
    expected_response_keys: fixture.expected_response_keys,
    actual_response_keys: actualKeys,
    missing_keys: missingKeys,
    unexpected_response: unexpectedResponse,
    doc_url: fixture.doc_url,
    pinned_api_version: fixture.pinned_api_version,
  };

  if (driftDetected) {
    if (unexpectedResponse) {
      report.recommendation = `Response was not a JSON object. Platform may have changed response format. Check ${fixture.doc_url} for the current shape.`;
    } else {
      report.recommendation = `Response is missing expected key(s) [${missingKeys.join(", ")}]. Platform likely renamed or deprecated these fields. Check ${fixture.doc_url} for current field names and update packages/${platform}/fixtures/canonical-request.json accordingly.`;
    }
  }

  return report;
}

/**
 * Synchronously load a JSON fixture relative to a package's `fixtures/` dir.
 * Intended for use at module init.
 */
export function loadJsonFixture<T = unknown>(packageRootMetaUrl: string, filename: string): T {
  const __dirname = dirname(fileURLToPath(packageRootMetaUrl));
  // packageRootMetaUrl is typically `import.meta.url` from `src/index.ts` or a tool file
  // dist/index.js → ../fixtures/  resolves to package_root/fixtures/
  const path = resolve(__dirname, "..", "fixtures", filename);
  return JSON.parse(readFileSync(path, "utf8")) as T;
}
