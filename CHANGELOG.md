# Changelog

All notable changes to ads-mcp.

## [0.1.1] — 2026-04-28

Self-update mechanism (Tier 3) and publish infrastructure.

### Added — drift detection
- Per-platform `fixtures/canonical-request.json` files: known-good request shape with placeholder substitution. If LinkedIn (or any platform) silently changes their response schema, the next `doctor --check-drift` surfaces it.
- `packages/core/src/DriftChecker.ts`: `substituteFixture()`, `analyzeResponse()`, `loadJsonFixture()` helpers
- `apps/cli/src/checkDrift.ts`: runs each platform's fixture against the user's account, reports drift with doc URL and remediation hint
- `ads-mcp doctor --check-drift` flag

### Added — version awareness
- `apps/cli/src/checkVersions.ts`: lists pinned API versions per platform with doc URLs
- `ads-mcp check-versions` subcommand

### Added — npm-update advisory
- `packages/core/src/NpmVersionCheck.ts`: hits the npm registry, compares installed vs latest
- `doctor` ends with a non-blocking "update available" announcement when a newer published version exists; silently no-ops when offline or pre-publish

### Added — field manifests as data
- `packages/linkedin-ads/fixtures/fields-analytics.json` — LinkedIn's analytics metric list as JSON, source of truth
- `packages/meta-ads/fixtures/fields-insights.json` — Meta Insights field categories
- Tools currently still embed copies; future patch-release migrates the imports

### Added — publish infrastructure
- `.github/workflows/ci.yml`: build + test matrix on Ubuntu and macOS, Node 20 and 22; uploads `.plugin` artifact
- `.github/workflows/publish.yml`: triggered on `v*.*.*` tag push; verifies tag/version match, publishes all workspace packages to npm with `--provenance`, creates GitHub release with `.plugin` attached
- `RELEASING.md`: full release procedure with prerequisites
- All workspace + apps packages now publish-ready: `private` removed, `publishConfig: { access: public }`, `repository`/`homepage`/`bugs` set to `github.com/manlikemuneeb/ads-mcp`, workspace-internal deps pinned to `^0.1.1`

### Known limitations (carried into Phase 2)
- `check-versions` lists pinned versions but doesn't yet auto-fetch and diff official doc pages
- Field manifests exist as JSON but tool files still embed hardcoded copies; full refactor pending

## [0.1.0] — 2026-04-28

First internal-ready release. Functionally complete across Meta Ads, LinkedIn Ads, Google Ads, GA4, and Google Search Console.

### Added

**Platforms and tools (53 total)**
- **Meta Ads** (14 tools): account.overview, campaigns.list, adsets.list, ads.list, insights.demographics, insights.placements, insights.creative, insights.funnel, insights.budget_pacing, campaigns.pause, campaigns.resume, campaigns.update_budget, passthrough.read, passthrough.write
- **LinkedIn Ads** (8 tools): account.overview, campaigns.list, analytics, campaigns.pause, campaigns.resume, campaigns.update_budget, passthrough.read, passthrough.write
- **Google Ads** (6 tools): query (universal GAQL), campaigns.list, campaigns.pause, campaigns.resume, campaigns.update_budget, passthrough.mutate
- **GA4** (15 tools): report.run, report.realtime, report.batch, report.pivot, accounts.list, properties.list (auto-discovers accounts), properties.get, data_streams.list, conversion_events.list, conversion_events.create, conversion_events.delete, custom_dimensions.list, custom_metrics.list, passthrough.read, passthrough.write
- **GSC** (9 tools): sites.list, sites.add, sites.delete, sitemaps.list, sitemaps.get, sitemaps.submit, sitemaps.delete, search_analytics.query, url_inspection.inspect
- **Core** (1): core.diagnose for installation health

**Multi-account support** — config-driven across every platform. Tools accept an `account` parameter; multiple accounts under one platform are first-class.

**Write guard-rails**
- Per-account `mode: "read" | "read_write"` toggle
- Global and per-call `dry_run` flag, default true
- Every mutation attempt audit-logged to `~/.ads-mcp/audit.log` (allow_dry_run / live_success / live_failure / deny_*)

**CLI** (`ads-mcp` binary)
- `ads-mcp setup` — interactive wizard with per-platform live smoke-test before saving credentials
- `ads-mcp doctor` — validates config and pings every enabled platform with live credentials
- `ads-mcp help`

**Distribution**
- npm workspace with 7 packages
- `.plugin` packaging via `npm run pack:plugin` for Claude Code / Cowork drag-and-drop install
- Per-AI-client install docs (Claude Desktop, Cursor, Cline, Continue, Claude Code) in `docs/install/`
- Per-platform auth/token-acquisition guides in `docs/auth/`
- Ready-to-paste `mcp.json` snippets in `examples/mcp-snippets/`

**Locked API versions**
- Meta Graph API v25.0
- LinkedIn-Version 202604
- Google Ads REST v22

### Fixed (during pre-ship debugging)

- LinkedIn /adAnalytics — URL encoding mismatch where URLSearchParams percent-encoded structural chars (commas, parens, colons) that LinkedIn's Rest.li 2.0 layer doesn't decode. Replaced with custom encoder that only escapes URL-meta chars and whitespace, passes everything else through raw including pre-encoded `%3A` URN literals.
- LinkedIn /adAnalytics — query syntax: doc-exact format is **inline** (`dateRange=(start:(year:Y,...),...)` and `accounts=List(urn%3A...)`), not Singer's dot-notation + indexed-array form.
- LinkedIn /adCampaigns — endpoint moved to `/adAccounts/{id}/adCampaigns?q=search`. Old account-filter-via-search-expression returns 400. All read AND write tools updated.
- GA4 properties.list — required filter parameter; tool now auto-discovers accounts when omitted.
- Google Ads — locked to v22 after spike confirmed v18 and earlier are sunset.

### Known limitations (Phase 2 work)

- Token paste only; no OS keychain integration yet (config file is chmod 600 as the safety boundary)
- Token refresh is on-demand, not automatic; long-lived tokens still expire (~60 days for Meta, 60 days for LinkedIn access)
- Some long-tail writes go through `passthrough.write` rather than named tools (audit log entry has less rich detail)
- LinkedIn `rw_ads` write scope may require Marketing Developer Platform partner approval depending on the dev app's status

### Phase 2 plan (separate release)

1. OAuth wizard replacing token paste
2. OS keychain for secret storage
3. Schema introspection at boot via per-platform fixture requests
4. Doc-version pinning + diff job
5. Field manifests as JSON data
6. Auto-update via npm tag
7. Named-tool coverage to retire `passthrough.write` for common operations
