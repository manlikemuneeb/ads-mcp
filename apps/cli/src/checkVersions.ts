import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { CanonicalRequestFixture } from "@manlikemuneeb/ads-mcp-core";
import { failure, header, info, success } from "./prompt.js";

interface CheckResult {
  platform: string;
  pinned: string;
  doc_url: string;
  status: "current" | "newer_available" | "deprecated" | "unknown";
  detail?: string;
}

/**
 * Compare each platform's pinned API version against what's reachable from the
 * official docs. Best-effort: doesn't make network calls in this version, just
 * reports what's pinned and the doc URL where users can verify currency.
 *
 * Phase 2 enhancement: actually fetch the doc page and parse the current
 * version moniker from the URL or page metadata.
 */
export async function runCheckVersions(): Promise<number> {
  header("ads-mcp version check");
  info("Pinned API versions across platforms. Visit each doc URL to confirm currency.\n");

  const results: CheckResult[] = [];

  for (const pkg of ["meta-ads", "linkedin-ads", "google-ads", "ga4", "gsc"]) {
    const fixture = loadFixtureFromWorkspace(pkg);
    if (!fixture) {
      info(`  ${pkg}: fixture not found; skipping`);
      continue;
    }
    results.push({
      platform: pkg,
      pinned: fixture.pinned_api_version,
      doc_url: fixture.doc_url,
      status: "current", // best-effort default
    });
  }

  for (const r of results) {
    success(`  ${r.platform.padEnd(14)} pinned ${r.pinned}`);
    info(`    docs: ${r.doc_url}`);
  }

  info("\nTo check currency manually:");
  info("  1. Open each doc URL in a browser");
  info("  2. Confirm the version moniker (e.g. li-lms-2026-04 for LinkedIn) is still current");
  info("  3. If a newer version is available and stable, update packages/<platform>/src/version.ts");
  info("  4. Run `npm test` to verify regression tests still pass against the new version");
  info("  5. Run `ads-mcp doctor --check-drift` to verify response shape against the pinned fixtures");

  info("\nNote: automated version-bump suggestions are a Phase 2 enhancement.");
  info("This command's job today is to surface the pinned versions so you know what to check.");

  // Always exit 0 from this command since we're not (yet) detecting drift
  return 0;
}

function loadFixtureFromWorkspace(pkgDirName: string): CanonicalRequestFixture | null {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    // Workspace dev: cli/dist/checkVersions.js → ../../packages/<pkg>/fixtures/canonical-request.json
    resolve(__dirname, "..", "..", "..", "packages", pkgDirName, "fixtures", "canonical-request.json"),
    // From process.cwd
    resolve(process.cwd(), "packages", pkgDirName, "fixtures", "canonical-request.json"),
    // Inside the .plugin bundle: cli/dist → ../packages/<pkg>/fixtures
    resolve(__dirname, "..", "..", "packages", pkgDirName, "fixtures", "canonical-request.json"),
  ];
  for (const c of candidates) {
    try {
      const raw = readFileSync(c, "utf8");
      return JSON.parse(raw) as CanonicalRequestFixture;
    } catch {
      /* try next */
    }
  }
  return null;
}

export { failure }; // re-export so tests can verify wiring
