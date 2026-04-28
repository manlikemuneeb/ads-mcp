import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";

/**
 * Doc-page drift detection.
 *
 * Each ads platform publishes API field references on a documentation page.
 * When Meta, LinkedIn, or Google add/remove fields, those pages change
 * before our pinned manifests do — and silent drift between docs and
 * `fixtures/fields-*.json` means tools that worked yesterday return weird
 * results today.
 *
 * This module fetches each registered doc page, normalizes its content to
 * strip volatility (whitespace runs, common nav/footer noise, ISO timestamps
 * embedded in last-modified spans), hashes the result, and compares against
 * the last-seen hash stored at ~/.ads-mcp/doc-state.json. The CLI
 * `ads-mcp check-versions` and `ads-mcp doctor --check-drift` invoke this
 * to surface "doc changed since 2026-04-28 — review fields manifest".
 *
 * What this is NOT:
 *   - Not a semantic diff. We can tell you the page changed, not what changed.
 *     For semantic field-list diffs, the per-platform fixtures-vs-API drift
 *     check in `DriftChecker.ts` covers structured response shape.
 *   - Not a JS-renderer. Pages that hide their field lists behind a SPA
 *     boot won't yield useful hashes; we surface that as a fetch failure.
 */

// --- Types -----------------------------------------------------------------

export type FetchFn = (url: string) => Promise<{ status: number; text: string }>;

export interface DocPageEntry {
  /** Stable identifier — printed in CLI output. */
  label: string;
  /** Live URL to fetch. */
  url: string;
  /** Platform this page covers — determines which manifest to advise editing. */
  platform: "meta" | "linkedin" | "google_ads" | "ga4" | "gsc";
  /** Optional: the fixtures file the user should review when this page drifts. */
  refers_to?: string;
}

export interface StoredHash {
  hash: string;
  last_checked: string;  // ISO 8601
  last_changed: string;  // ISO 8601 — when the hash last differed from prior
}

export interface DocStateFile {
  version: 1;
  pages: Record<string, StoredHash>; // keyed by url
}

export interface DriftCheckResult {
  url: string;
  label: string;
  platform: string;
  /**
   * - "unchanged": hash matches last-seen, no action needed
   * - "changed":   hash differs from last-seen (drift!)
   * - "baseline":  no prior state, this run sets the baseline
   * - "fetch_error": couldn't fetch the page (network, 4xx/5xx, etc.)
   */
  status: "unchanged" | "changed" | "baseline" | "fetch_error";
  current_hash?: string;
  previous_hash?: string;
  last_checked?: string;
  last_changed?: string;
  error?: string;
  refers_to?: string;
}

// --- Defaults --------------------------------------------------------------

const DEFAULT_STATE_PATH = resolve(homedir(), ".ads-mcp", "doc-state.json");

const defaultFetch: FetchFn = async (url) => {
  const res = await globalThis.fetch(url, {
    headers: {
      // Some doc CDNs return SPA shells unless a real browser UA shows up.
      "User-Agent":
        "ads-mcp doc-drift checker (+https://github.com/manlikemuneeb/ads-mcp)",
      Accept: "text/html,application/xhtml+xml",
    },
  });
  return { status: res.status, text: await res.text() };
};

// --- Hashing ---------------------------------------------------------------

/**
 * Reduce the page to its stable text content so per-request volatility (cache-
 * buster URLs in <link> preloads, session-bound JSON config blobs, build hashes
 * in script src, CSRF tokens in <meta> tags, ISO timestamps in "last updated"
 * widgets) doesn't masquerade as content drift.
 *
 * Strategy: rip out anything that's not human-visible documentation text.
 *   1. Strip the entire <head>...</head> (cache-buster preloads, CSP nonces,
 *      OG tags, build IDs, etc. all live here and rotate per request).
 *   2. Strip script / style / noscript blocks anywhere they appear.
 *   3. Strip HTML comments.
 *   4. Strip every HTML tag, leaving only visible text and entities.
 *   5. Strip ISO 8601 timestamps, date stamps, and version-rev numbers
 *      embedded in the visible text (e.g. some doc sites print
 *      "Last updated 2026-04-28").
 *   6. Collapse whitespace runs.
 *
 * Tradeoff: a pure CSS or layout reshuffle without text changes won't fire
 * drift. That's acceptable — we care about field/parameter list changes,
 * which always show up in visible text.
 */
export function normalizeDocHtml(raw: string): string {
  let s = raw;
  // 1. Drop the <head> block entirely.
  s = s.replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, "");
  // 2. Drop scripts/styles/noscripts wherever they appear.
  s = s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  s = s.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
  s = s.replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, "");
  // 3. Drop HTML comments (often carry build IDs).
  s = s.replace(/<!--[\s\S]*?-->/g, "");
  // 4. Strip every remaining tag, leaving just visible text.
  s = s.replace(/<[^>]+>/g, " ");
  // Decode the most common HTML entities so equivalent content with
  // different entity encodings hashes the same.
  s = s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
  // 5. Strip ISO 8601 timestamps and bare YYYY-MM-DD date stamps.
  s = s.replace(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?\b/g, "");
  s = s.replace(/\b\d{4}-\d{2}-\d{2}\b/g, "");
  // Strip long hex/numeric IDs that look like session or revision tokens
  // embedded in visible text (e.g. "rev:1038303932" debug breadcrumbs that
  // some doc sites leak into footers).
  s = s.replace(/\b[0-9a-f]{16,}\b/gi, "");
  s = s.replace(/\b\d{10,}\b/g, "");
  // 6. Collapse whitespace.
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

export function hashDocPage(raw: string): string {
  const normalized = normalizeDocHtml(raw);
  return createHash("sha256").update(normalized).digest("hex");
}

// --- State file I/O --------------------------------------------------------

export async function loadDocState(
  statePath: string = DEFAULT_STATE_PATH,
): Promise<DocStateFile> {
  try {
    const raw = await readFile(statePath, "utf8");
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      parsed.version === 1 &&
      typeof parsed.pages === "object"
    ) {
      return parsed as DocStateFile;
    }
    return { version: 1, pages: {} };
  } catch (err) {
    // ENOENT / parse failure => empty state.
    if (
      (err as NodeJS.ErrnoException).code === "ENOENT" ||
      err instanceof SyntaxError
    ) {
      return { version: 1, pages: {} };
    }
    throw err;
  }
}

export async function saveDocState(
  state: DocStateFile,
  statePath: string = DEFAULT_STATE_PATH,
): Promise<void> {
  await mkdir(dirname(statePath), { recursive: true });
  await writeFile(statePath, JSON.stringify(state, null, 2), { mode: 0o600 });
}

// --- Drift check -----------------------------------------------------------

/**
 * Fetch one doc page, compare to stored state, return a DriftCheckResult.
 * Mutates the passed-in `state` so the caller can save once at the end of
 * a multi-page check rather than once per page.
 */
export async function checkOneDocPage(
  entry: DocPageEntry,
  state: DocStateFile,
  options: {
    fetchFn?: FetchFn;
    now?: () => Date;
  } = {},
): Promise<DriftCheckResult> {
  const fetchFn = options.fetchFn ?? defaultFetch;
  const nowFn = options.now ?? (() => new Date());
  const nowIso = nowFn().toISOString();

  const result: DriftCheckResult = {
    url: entry.url,
    label: entry.label,
    platform: entry.platform,
    status: "fetch_error",
  };
  if (entry.refers_to !== undefined) result.refers_to = entry.refers_to;

  let response: { status: number; text: string };
  try {
    response = await fetchFn(entry.url);
  } catch (err) {
    result.error = `network: ${(err as Error).message}`;
    return result;
  }
  if (response.status < 200 || response.status >= 300) {
    result.error = `HTTP ${response.status}`;
    return result;
  }
  if (!response.text || response.text.trim().length === 0) {
    result.error = "empty body";
    return result;
  }

  const currentHash = hashDocPage(response.text);
  const previous = state.pages[entry.url];
  result.current_hash = currentHash;

  if (!previous) {
    // First time seeing this URL — establish baseline.
    state.pages[entry.url] = {
      hash: currentHash,
      last_checked: nowIso,
      last_changed: nowIso,
    };
    result.status = "baseline";
    result.last_checked = nowIso;
    result.last_changed = nowIso;
    return result;
  }

  result.previous_hash = previous.hash;

  if (previous.hash === currentHash) {
    state.pages[entry.url] = {
      ...previous,
      last_checked: nowIso,
    };
    result.status = "unchanged";
    result.last_checked = nowIso;
    result.last_changed = previous.last_changed;
    return result;
  }

  // Drift!
  state.pages[entry.url] = {
    hash: currentHash,
    last_checked: nowIso,
    last_changed: nowIso,
  };
  result.status = "changed";
  result.last_checked = nowIso;
  result.last_changed = nowIso;
  return result;
}

/**
 * Check every page in a list, accumulating into one state file write at the end.
 */
export async function checkDocPages(
  entries: DocPageEntry[],
  options: {
    statePath?: string;
    fetchFn?: FetchFn;
    now?: () => Date;
  } = {},
): Promise<{ results: DriftCheckResult[]; state: DocStateFile }> {
  const statePath = options.statePath ?? DEFAULT_STATE_PATH;
  const state = await loadDocState(statePath);
  const results: DriftCheckResult[] = [];
  for (const entry of entries) {
    const subOpts: { fetchFn?: FetchFn; now?: () => Date } = {};
    if (options.fetchFn) subOpts.fetchFn = options.fetchFn;
    if (options.now) subOpts.now = options.now;
    results.push(await checkOneDocPage(entry, state, subOpts));
  }
  await saveDocState(state, statePath);
  return { results, state };
}

// --- Built-in registry of doc pages we monitor ----------------------------

/**
 * Authoritative documentation pages per platform. When we add or rename a
 * tool that depends on a Meta endpoint, add the matching doc URL here so
 * future drift checks include it. The `refers_to` field tells the user
 * which fixtures/manifest to update if drift is detected.
 */
export const DEFAULT_DOC_PAGES: DocPageEntry[] = [
  // Meta — Marketing API v25.0
  {
    label: "Meta Insights overview",
    url: "https://developers.facebook.com/docs/marketing-api/insights",
    platform: "meta",
    refers_to: "packages/meta-ads/fixtures/fields-insights.json",
  },
  {
    label: "Meta Ad Account Insights reference",
    url: "https://developers.facebook.com/docs/marketing-api/reference/ad-account/insights",
    platform: "meta",
    refers_to: "packages/meta-ads/fixtures/fields-insights.json",
  },
  {
    label: "Meta Ad Campaign reference",
    url: "https://developers.facebook.com/docs/marketing-api/reference/ad-campaign-group",
    platform: "meta",
    refers_to: "packages/meta-ads/src/tools/campaigns.create.ts",
  },
  {
    label: "Meta Audiences overview",
    url: "https://developers.facebook.com/docs/marketing-api/audiences",
    platform: "meta",
    refers_to: "packages/meta-ads/src/tools/adsets.create.ts (targeting pass-through)",
  },
  {
    label: "Meta Targeting Search",
    url: "https://developers.facebook.com/docs/marketing-api/targeting-search",
    platform: "meta",
    refers_to: "packages/meta-ads/src/tools/targeting.search.ts",
  },

  // LinkedIn — li-lms-2026-04
  {
    label: "LinkedIn Ads Reporting schema",
    url: "https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads-reporting/ads-reporting-schema?view=li-lms-2026-04",
    platform: "linkedin",
    refers_to: "packages/linkedin-ads/fixtures/fields-analytics.json",
  },
  {
    label: "LinkedIn adAccounts API",
    url: "https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads/account-structure/create-and-manage-accounts?view=li-lms-2026-04",
    platform: "linkedin",
    refers_to: "packages/linkedin-ads/src/tools/account.overview.ts",
  },

  // Google Ads — REST v22
  {
    label: "Google Ads GAQL field reference",
    url: "https://developers.google.com/google-ads/api/fields/v22/overview",
    platform: "google_ads",
    refers_to: "packages/google-ads/src/tools/query.ts",
  },
  {
    label: "Google Ads campaign field reference",
    url: "https://developers.google.com/google-ads/api/fields/v22/campaign",
    platform: "google_ads",
    refers_to: "packages/google-ads/src/tools/campaigns.list.ts",
  },
  {
    label: "Google Ads REST reference index",
    url: "https://developers.google.com/google-ads/api/reference/rest",
    platform: "google_ads",
    refers_to: "packages/google-ads/src/version.ts (api version pin)",
  },

  // GA4 — v1beta
  {
    label: "GA4 Data API runReport",
    url: "https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/properties/runReport",
    platform: "ga4",
    refers_to: "packages/ga4/src/tools/report.run.ts",
  },
  {
    label: "GA4 Admin API customDimensions",
    url: "https://developers.google.com/analytics/devguides/config/admin/v1/rest/v1beta/properties.customDimensions",
    platform: "ga4",
    refers_to: "packages/ga4/src/tools/custom_dimensions.create.ts",
  },

  // GSC — v3
  {
    label: "Google Search Console searchanalytics.query",
    url: "https://developers.google.com/webmaster-tools/v1/searchanalytics/query",
    platform: "gsc",
    refers_to: "packages/gsc/src/tools/search_analytics.query.ts",
  },
];

// --- CLI rendering helpers (used by checkVersions.ts) ---------------------

export function formatDriftSummary(results: DriftCheckResult[]): string {
  const lines: string[] = [];
  const grouped: Record<string, DriftCheckResult[]> = {};
  for (const r of results) {
    grouped[r.platform] ??= [];
    grouped[r.platform]!.push(r);
  }

  for (const [platform, items] of Object.entries(grouped)) {
    lines.push(`\n  ${platform.toUpperCase()}`);
    for (const r of items) {
      const icon = iconFor(r.status);
      const line = `    ${icon} ${r.label}`;
      lines.push(line);
      lines.push(`        ${r.url}`);
      if (r.status === "unchanged") {
        lines.push(
          `        unchanged since ${shortDate(r.last_changed)}, last checked ${shortDate(r.last_checked)}`,
        );
      } else if (r.status === "changed") {
        lines.push(
          `        ⚠ changed since ${shortDate(r.last_changed)} — review ${r.refers_to ?? "the matching manifest"}`,
        );
      } else if (r.status === "baseline") {
        lines.push(`        baseline established at ${shortDate(r.last_checked)}`);
      } else {
        lines.push(`        fetch error: ${r.error ?? "unknown"}`);
      }
    }
  }
  return lines.join("\n");
}

function iconFor(status: DriftCheckResult["status"]): string {
  switch (status) {
    case "unchanged":
      return "✓";
    case "changed":
      return "⚠";
    case "baseline":
      return "•";
    case "fetch_error":
      return "✗";
  }
}

function shortDate(iso: string | undefined): string {
  if (!iso) return "—";
  return iso.slice(0, 10);
}
