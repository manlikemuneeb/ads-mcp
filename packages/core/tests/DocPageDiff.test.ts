import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_DOC_PAGES,
  type DocPageEntry,
  type DocStateFile,
  checkDocPages,
  checkOneDocPage,
  formatDriftSummary,
  hashDocPage,
  loadDocState,
  normalizeDocHtml,
  saveDocState,
} from "../src/DocPageDiff.js";

describe("DocPageDiff — normalization", () => {
  it("strips script and style blocks", () => {
    const html = `
      <body>
        <h1>Field reference</h1>
        <script>console.log('build-id-12345')</script>
        <style>.x { color: red }</style>
        <p>impressions, clicks, spend</p>
      </body>`;
    const out = normalizeDocHtml(html);
    expect(out).not.toContain("console.log");
    expect(out).not.toContain("color: red");
    expect(out).toContain("impressions, clicks, spend");
  });

  it("strips ISO 8601 timestamps and date stamps", () => {
    const a = "Last updated 2026-04-28T03:14:15Z. Field: impressions.";
    const b = "Last updated 2026-04-29T11:22:33+00:00. Field: impressions.";
    // Both should normalize to the same content.
    expect(normalizeDocHtml(a)).toBe(normalizeDocHtml(b));
  });

  it("strips data-build-id, nonce, and other volatile attributes", () => {
    const a = '<div nonce="abc123" data-build-id="42">x</div>';
    const b = '<div nonce="zzz999" data-build-id="999">x</div>';
    expect(normalizeDocHtml(a)).toBe(normalizeDocHtml(b));
  });

  it("collapses whitespace runs", () => {
    expect(normalizeDocHtml("  a   b\n\n  c  ")).toBe("a b c");
  });

  it("strips HTML comments and noscript blocks", () => {
    const html = `<!-- build 12345 --><noscript>fallback render token-67890</noscript><p>hello</p>`;
    const out = normalizeDocHtml(html);
    expect(out).not.toContain("12345");
    expect(out).not.toContain("67890");
    expect(out).toContain("hello");
  });

  it("strips the entire <head> block including volatile preload links", () => {
    // Meta and Google docs put cache-buster URLs and CSP nonces in <head>
    // that rotate per request. Two pages with identical body content but
    // different head must hash the same.
    const a = `<html><head>
      <link rel="preload" href="https://cdn.example/v4iD9b4/y5/asset.js" nonce="aaa111">
      <meta name="csrf-token" content="session-abc">
    </head><body><p>impressions, clicks, spend</p></body></html>`;
    const b = `<html><head>
      <link rel="preload" href="https://cdn.example/v9zR3qq/y5/asset.js" nonce="zzz999">
      <meta name="csrf-token" content="session-xyz">
    </head><body><p>impressions, clicks, spend</p></body></html>`;
    expect(normalizeDocHtml(a)).toBe(normalizeDocHtml(b));
  });

  it("strips long hex and numeric tokens leaked into visible text", () => {
    // Some doc sites print server build IDs in footer breadcrumbs. We don't
    // want those to fire drift.
    const a = "<body><p>impressions</p><footer>req 7633861512097902072</footer></body>";
    const b = "<body><p>impressions</p><footer>req 8124005556666123456</footer></body>";
    expect(normalizeDocHtml(a)).toBe(normalizeDocHtml(b));

    const c = "<body>rev:1038303932 fields: impressions</body>";
    const d = "<body>rev:9999999999 fields: impressions</body>";
    expect(normalizeDocHtml(c)).toBe(normalizeDocHtml(d));
  });

  it("decodes common HTML entities so equivalent content matches", () => {
    const a = "<p>title &amp; description &nbsp; &quot;value&quot;</p>";
    const b = "<p>title & description   \"value\"</p>";
    expect(normalizeDocHtml(a)).toBe(normalizeDocHtml(b));
  });

  it("preserves real content changes (sanity check that we haven't over-normalized)", () => {
    // Adding a new field name to the body must produce a different hash.
    const before = "<body><h1>Fields</h1><p>impressions, clicks</p></body>";
    const after = "<body><h1>Fields</h1><p>impressions, clicks, NEW_FIELD</p></body>";
    expect(normalizeDocHtml(before)).not.toBe(normalizeDocHtml(after));
  });
});

describe("DocPageDiff — hashing", () => {
  it("same content → same hash", () => {
    const html = "<body><h1>impressions, clicks, spend</h1></body>";
    expect(hashDocPage(html)).toBe(hashDocPage(html));
  });

  it("noise-only differences hash identically", () => {
    const a = '<body><script>x()</script><p>impressions</p></body>';
    const b = '<body><script>different()</script><p>impressions</p></body>';
    expect(hashDocPage(a)).toBe(hashDocPage(b));
  });

  it("real content differences produce different hashes", () => {
    const a = "<p>impressions, clicks</p>";
    const b = "<p>impressions, clicks, NEW_FIELD</p>";
    expect(hashDocPage(a)).not.toBe(hashDocPage(b));
  });

  it("returns a 64-char SHA-256 hex digest", () => {
    expect(hashDocPage("anything")).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("DocPageDiff — state file roundtrip", () => {
  let tempDir: string;
  let statePath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "docdiff-"));
    statePath = join(tempDir, "doc-state.json");
  });

  it("loads an empty state when the file doesn't exist", async () => {
    const state = await loadDocState(statePath);
    expect(state).toEqual({ version: 1, pages: {} });
  });

  it("loads an empty state when the file is malformed JSON", async () => {
    const fs = await import("node:fs/promises");
    await fs.writeFile(statePath, "{ not valid json", "utf8");
    const state = await loadDocState(statePath);
    expect(state).toEqual({ version: 1, pages: {} });
  });

  it("save then load returns the same state", async () => {
    const state: DocStateFile = {
      version: 1,
      pages: {
        "https://example.com/a": {
          hash: "abc123",
          last_checked: "2026-04-28T00:00:00.000Z",
          last_changed: "2026-04-28T00:00:00.000Z",
        },
      },
    };
    await saveDocState(state, statePath);
    const loaded = await loadDocState(statePath);
    expect(loaded).toEqual(state);
  });

  it("creates the parent directory when missing", async () => {
    const nested = join(tempDir, "nested", "deeper", "doc-state.json");
    await saveDocState({ version: 1, pages: {} }, nested);
    expect(JSON.parse(readFileSync(nested, "utf8"))).toEqual({
      version: 1,
      pages: {},
    });
  });
});

describe("DocPageDiff — drift logic", () => {
  const entry: DocPageEntry = {
    label: "Test page",
    url: "https://example.com/docs/x",
    platform: "meta",
    refers_to: "fixtures/x.json",
  };

  function fakeFetch(text: string, status = 200) {
    return async () => ({ status, text });
  }

  it("status=baseline on first sighting", async () => {
    const state: DocStateFile = { version: 1, pages: {} };
    const r = await checkOneDocPage(entry, state, {
      fetchFn: fakeFetch("<body>impressions</body>"),
      now: () => new Date("2026-05-01T00:00:00.000Z"),
    });
    expect(r.status).toBe("baseline");
    expect(r.last_checked).toBe("2026-05-01T00:00:00.000Z");
    expect(state.pages[entry.url]).toBeDefined();
  });

  it("status=unchanged when hash matches; updates last_checked but not last_changed", async () => {
    const state: DocStateFile = { version: 1, pages: {} };
    await checkOneDocPage(entry, state, {
      fetchFn: fakeFetch("<body>impressions</body>"),
      now: () => new Date("2026-05-01T00:00:00.000Z"),
    });
    const prev = { ...state.pages[entry.url]! };

    const r = await checkOneDocPage(entry, state, {
      fetchFn: fakeFetch("<body>impressions</body>"),
      now: () => new Date("2026-05-08T00:00:00.000Z"),
    });
    expect(r.status).toBe("unchanged");
    expect(r.last_changed).toBe(prev.last_changed); // unchanged
    expect(r.last_checked).toBe("2026-05-08T00:00:00.000Z"); // bumped
    expect(state.pages[entry.url]!.last_changed).toBe(prev.last_changed);
    expect(state.pages[entry.url]!.last_checked).toBe("2026-05-08T00:00:00.000Z");
  });

  it("status=changed when hash differs; bumps both timestamps and stores new hash", async () => {
    const state: DocStateFile = { version: 1, pages: {} };
    await checkOneDocPage(entry, state, {
      fetchFn: fakeFetch("<body>impressions</body>"),
      now: () => new Date("2026-05-01T00:00:00.000Z"),
    });
    const oldHash = state.pages[entry.url]!.hash;

    const r = await checkOneDocPage(entry, state, {
      fetchFn: fakeFetch("<body>impressions, clicks, NEW_FIELD</body>"),
      now: () => new Date("2026-05-08T00:00:00.000Z"),
    });
    expect(r.status).toBe("changed");
    expect(r.previous_hash).toBe(oldHash);
    expect(r.current_hash).not.toBe(oldHash);
    expect(r.last_changed).toBe("2026-05-08T00:00:00.000Z");
    expect(state.pages[entry.url]!.hash).toBe(r.current_hash);
  });

  it("status=fetch_error on non-2xx", async () => {
    const state: DocStateFile = { version: 1, pages: {} };
    const r = await checkOneDocPage(entry, state, {
      fetchFn: fakeFetch("Not Found", 404),
    });
    expect(r.status).toBe("fetch_error");
    expect(r.error).toContain("404");
    // State is not mutated for this URL on fetch error.
    expect(state.pages[entry.url]).toBeUndefined();
  });

  it("status=fetch_error on network throw", async () => {
    const state: DocStateFile = { version: 1, pages: {} };
    const r = await checkOneDocPage(entry, state, {
      fetchFn: async () => {
        throw new Error("ECONNRESET");
      },
    });
    expect(r.status).toBe("fetch_error");
    expect(r.error).toContain("ECONNRESET");
  });

  it("status=fetch_error on empty body", async () => {
    const state: DocStateFile = { version: 1, pages: {} };
    const r = await checkOneDocPage(entry, state, {
      fetchFn: fakeFetch("   "),
    });
    expect(r.status).toBe("fetch_error");
    expect(r.error).toContain("empty");
  });
});

describe("DocPageDiff — checkDocPages batch", () => {
  let tempDir: string;
  let statePath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "docdiff-batch-"));
    statePath = join(tempDir, "doc-state.json");
  });

  it("processes a list, persists state once at the end", async () => {
    const entries: DocPageEntry[] = [
      { label: "A", url: "https://a.example/", platform: "meta" },
      { label: "B", url: "https://b.example/", platform: "linkedin" },
    ];
    const fakeFetch = async (url: string) => ({
      status: 200,
      text: `<body>${url} content</body>`,
    });
    const { results, state } = await checkDocPages(entries, {
      statePath,
      fetchFn: fakeFetch,
      now: () => new Date("2026-05-01T00:00:00.000Z"),
    });
    expect(results.length).toBe(2);
    expect(results.every((r) => r.status === "baseline")).toBe(true);
    expect(Object.keys(state.pages).sort()).toEqual([
      "https://a.example/",
      "https://b.example/",
    ]);
    // State was persisted; load it back fresh to confirm.
    const loaded = await loadDocState(statePath);
    expect(loaded.pages["https://a.example/"]).toBeDefined();
    expect(loaded.pages["https://b.example/"]).toBeDefined();
  });
});

describe("DocPageDiff — registry sanity", () => {
  it("default registry covers all 5 platforms with valid URLs", () => {
    const platforms = new Set(DEFAULT_DOC_PAGES.map((p) => p.platform));
    expect(platforms.has("meta")).toBe(true);
    expect(platforms.has("linkedin")).toBe(true);
    expect(platforms.has("google_ads")).toBe(true);
    expect(platforms.has("ga4")).toBe(true);
    expect(platforms.has("gsc")).toBe(true);
    for (const p of DEFAULT_DOC_PAGES) {
      expect(p.url).toMatch(/^https?:\/\//);
      expect(p.label.length).toBeGreaterThan(0);
    }
  });

  it("every entry has a refers_to pointer", () => {
    for (const p of DEFAULT_DOC_PAGES) {
      expect(p.refers_to).toBeTruthy();
    }
  });
});

describe("DocPageDiff — formatDriftSummary", () => {
  it("renders a multi-platform summary", () => {
    const summary = formatDriftSummary([
      {
        url: "https://a/",
        label: "A",
        platform: "meta",
        status: "unchanged",
        last_checked: "2026-05-08T00:00:00.000Z",
        last_changed: "2026-04-01T00:00:00.000Z",
      },
      {
        url: "https://b/",
        label: "B",
        platform: "meta",
        status: "changed",
        last_checked: "2026-05-08T00:00:00.000Z",
        last_changed: "2026-05-08T00:00:00.000Z",
        refers_to: "fixtures/b.json",
      },
      {
        url: "https://c/",
        label: "C",
        platform: "linkedin",
        status: "baseline",
        last_checked: "2026-05-08T00:00:00.000Z",
      },
      {
        url: "https://d/",
        label: "D",
        platform: "google_ads",
        status: "fetch_error",
        error: "HTTP 503",
      },
    ]);
    expect(summary).toContain("META");
    expect(summary).toContain("LINKEDIN");
    expect(summary).toContain("GOOGLE_ADS");
    expect(summary).toContain("✓ A");
    expect(summary).toContain("⚠ B");
    expect(summary).toContain("• C");
    expect(summary).toContain("✗ D");
    expect(summary).toContain("fixtures/b.json");
    expect(summary).toContain("HTTP 503");
    // Date is rendered as the YYYY-MM-DD prefix.
    expect(summary).toContain("2026-04-01");
    expect(summary).toContain("2026-05-08");
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
