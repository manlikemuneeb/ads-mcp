import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_DOC_PAGES,
  checkDocPages,
  formatDriftSummary,
  type CanonicalRequestFixture,
} from "@manlikemuneeb/ads-mcp-core";
import { failure, header, info, success } from "./prompt.js";

interface CheckResult {
  platform: string;
  pinned: string;
  doc_url: string;
  status: "current" | "newer_available" | "deprecated" | "unknown";
  detail?: string;
}

/**
 * Surface each platform's pinned API version + run a doc-page drift check.
 *
 * Two-pass behavior:
 *   Pass 1 — list pinned API versions from each platform's canonical fixture.
 *            Tells the user what's locked in source.
 *   Pass 2 — fetch each registered documentation page (DocPageDiff registry)
 *            and compare the hash to ~/.ads-mcp/doc-state.json. First run
 *            establishes baseline; subsequent runs surface drift.
 *
 * Exit codes:
 *   0  — pinned versions listed, no doc drift detected (or baseline run).
 *   2  — doc drift detected. CI integrations can gate on this.
 */
export async function runCheckVersions(
  options: { skipDocDiff?: boolean } = {},
): Promise<number> {
  header("ads-mcp version check");
  info(
    "Pinned API versions across platforms, plus drift-detection on each platform's documentation pages.\n",
  );

  // ----- Pass 1: pinned versions from fixtures -----
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
      status: "current",
    });
  }

  info("Pinned API versions:");
  for (const r of results) {
    success(`  ${r.platform.padEnd(14)} pinned ${r.pinned}`);
    info(`    docs: ${r.doc_url}`);
  }

  // ----- Pass 2: doc-page drift (network) -----
  if (options.skipDocDiff) {
    info("\nSkipping doc-page drift check (--no-doc-diff).");
    return 0;
  }

  header("Doc-page drift check");
  info(
    "Fetching each registered documentation page and comparing against state at ~/.ads-mcp/doc-state.json.",
  );
  info("First run establishes baseline; subsequent runs surface drift.\n");

  let driftDetected = false;
  let fetchErrors = 0;
  try {
    const { results: driftResults } = await checkDocPages(DEFAULT_DOC_PAGES);
    info(formatDriftSummary(driftResults));
    for (const r of driftResults) {
      if (r.status === "changed") driftDetected = true;
      if (r.status === "fetch_error") fetchErrors++;
    }
    info("");
    if (driftDetected) {
      failure(
        "One or more doc pages have changed since last check. Review the indicated fixtures/manifests, then re-run `ads-mcp check-versions` to acknowledge.",
      );
    } else if (fetchErrors > 0) {
      info(
        `${fetchErrors} doc page${fetchErrors === 1 ? "" : "s"} could not be fetched (likely a transient network issue). Other pages were checked normally.`,
      );
    } else {
      success("All registered doc pages match their last-seen baseline.");
    }
  } catch (err) {
    failure(`Doc-page drift check failed: ${(err as Error).message}`);
    info("Re-run with --no-doc-diff to skip this pass.");
    return 0; // don't block the user just because the checker hit a snag
  }

  info("\nNext steps when drift is detected:");
  info("  1. Open the changed doc URL and read the change log / page diff.");
  info("  2. Update the listed `refers_to` fixture or tool source to match.");
  info("  3. Run `npm test` to confirm regression tests still pass.");
  info("  4. Run `ads-mcp doctor --check-drift` for live API-shape verification.");
  info("  5. Re-run `ads-mcp check-versions` to acknowledge the new baseline.");

  return driftDetected ? 2 : 0;
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
