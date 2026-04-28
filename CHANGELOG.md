# Changelog

All notable changes to ads-mcp.

## [0.2.0] — 2026-04-28

First public release. Phase 2 — OAuth wizard, OS-keychain credentials, auto-refresh, full Meta surface, doc-page drift detection. Folds in the v0.1.2 LinkedIn URN-to-name fix that was held back per the single-commit release policy.

### Added — OAuth wizard for 3 platforms

`ads-mcp setup --oauth <platform>` opens a browser, captures the redirect on a stable local port, exchanges the auth code, and stores the resulting credentials in your OS keychain. Supported platforms: `meta`, `linkedin`, `google` (where Google covers Google Ads, GA4, and GSC since they share one OAuth identity).

- `packages/core/src/OAuth/` — provider-agnostic OAuth 2.0 helper with PKCE, state generation, loopback HTTP server, code-for-token exchange.
- Per-platform providers in `meta-ads/src/oauth.ts`, `linkedin-ads/src/oauth.ts`, `core/src/OAuth/googleProvider.ts` — each tuned for the platform's flow type (Meta = no PKCE no refresh, LinkedIn = no PKCE with refresh, Google = PKCE with refresh).
- Defaults to `http://localhost:8765/` redirect URI on a stable port so users register one URI in their dev portal and reuse it forever.
- Wizard prompts include exact-match warnings and per-platform instructions for where to register the URI in each portal.

### Added — OS keychain credential storage

`packages/core/src/KeychainStore.ts` — cross-platform shell-out to OS-native CLIs:
- macOS: `security add-generic-password` / `find-generic-password`
- Linux: `secret-tool` from libsecret
- Windows: PowerShell Windows.Security.Credentials.PasswordVault

Zero npm deps. Tokens never sit in plaintext on disk. `SecretsManager` learned to resolve `kind: "keychain"` refs alongside `inline`, `env`, and `file`.

### Added — Auto-refresh of expired access tokens

`packages/core/src/TokenManager.ts` — handles cache, refresh, and rotation persistence. When LinkedIn (or any platform with refresh tokens) returns 401, the client invalidates and retries once with a fresh access token. If the provider rotates the refresh token, the new value is persisted back to the keychain entry. Audit log records every refresh.

`LinkedInClient` is wired with auto-refresh. Backward compatible: legacy static-token accounts (no refresh fields) continue to work via the existing `token_ref` path.

### Added — Field manifests as JSON

Hardcoded `const FIELDS = [...]` arrays moved to `packages/{platform}/fixtures/fields-*.json`. Tools import named slots; updating Meta's API surface no longer requires rewriting tool source files. LinkedIn (1 manifest, 3 slots) and Meta (1 manifest, 14 slots) migrated. Google Ads / GA4 / GSC don't have hardcoded field arrays — their tools embed field names in GAQL strings or request body shape.

### Added — 12 new named tools across all 5 platforms (initial coverage push)

- **Meta**: `campaigns.create`, `adsets.pause` / `resume` / `update_budget`, `ads.pause` / `resume`
- **LinkedIn**: `creatives.list` / `pause` / `resume`
- **Google Ads**: `ad_groups.list`
- **GA4**: `custom_dimensions.create`, `custom_metrics.create`

### Added — 21 new Meta tools (deep coverage push)

End-to-end Meta workflow now driven entirely by named tools:

- **Campaigns**: `update`, `delete`
- **Ad sets**: `create`, `update`, `delete`
- **Ads**: `create`, `update`, `delete`
- **Creatives**: `list`, `get`, `create_image`
- **Custom audiences**: `list`, `create_saved`, `create_lookalike`, `delete`
- **Tracking**: `pixels.list`, `custom_conversions.list`, `custom_conversions.create`
- **Lead gen**: `lead_gen_forms.list`, `lead_gen_forms.get_leads`
- **Insights**: `action_breakdown`
- **Planning**: `delivery_estimate`, `targeting.search`, `targeting.account_search`, `targeting.browse`

Total Meta tool count: 45 (was 12 before Phase 2).

### Added — Schema expansion with `additional_fields` pass-through

Every Meta create / update tool now exposes 15-25 named fields (vs 4-12 before) including: `bid_strategy`, `spend_cap_cents`, `start_time` / `stop_time`, `promoted_object`, `pacing_type`, `bid_constraints`, `attribution_spec`, `frequency_control_specs`, `adset_schedule` (dayparting), `conversion_specs`, `tracking_specs`, `optimization_sub_event`, `destination_type`, `display_sequence`, `priority`, `engagement_audience`, `conversion_domain`, `lead_gen_form_id`, `url_tags`, `instagram_actor_id`, `branded_content_sponsor_page_id`, `customer_file_source`, `event_source_type`, `advanced_rule`, `rule_aggregation`, plus `additional_fields` escape hatch on every create/update for any field not yet named.

All 6 Meta insights tools now share `time_range` (custom dates), `time_increment` (daily/weekly/monthly buckets), `filtering` (any field + 15 operators), `action_breakdowns`, `action_attribution_windows`, `level`, server-side `sort`, `use_unified_attribution_setting`, plus `additional_fields`.

All Meta list tools now support `status_filter`, `after` pagination cursor, and (where applicable) `name_search`.

### Added — Doc-page drift detection

`packages/core/src/DocPageDiff.ts` — fetches each registered platform documentation page, normalizes to stable text content (strips `<head>`, scripts, styles, comments, all tags, ISO timestamps, long hex/numeric session IDs), hashes, and compares against `~/.ads-mcp/doc-state.json`. 13 doc pages across all 5 platforms registered. Surfaces drift when Meta or Google move/edit a page so the user knows when to refresh field manifests.

`ads-mcp check-versions` now runs the drift pass after listing pinned versions. Returns exit 2 on drift (CI-gateable). `ads-mcp doctor --check-drift` includes it in the unified health check.

### Added — Doctor re-auth hint

When a platform call fails with a token-revoked / expired / invalid_client error, `ads-mcp doctor` now prints a follow-up hint with the exact `ads-mcp setup --oauth <platform>` command to re-authorize the affected account. Pattern detection covers LinkedIn `revoked`, Meta `OAuthException`, Google `invalid_grant`, generic 401s.

### Added — Companion documentation

- `META_TOOL_REFERENCE.md` — markdown reference for all Meta tools with input tables, return shapes, and pass-through field documentation.
- `META_TOOL_REFERENCE.xlsx` — 8-sheet Excel companion (Tool Index, Inputs, Outputs, Enums, Pass-through Fields, Defaults & Guard-rails, Edge Cases, README). 378 input rows, 197 enum values, 62 pass-through fields. Filterable / shareable inside HachiAI.

### Fixed (during real-world testing of v0.2.0-rc)

- LinkedIn OAuth wizard's redirect URI used an OS-assigned random port, which never matched the URI registered in LinkedIn's dev portal. Now defaults to `http://localhost:8765/` on stable port 8765.
- LinkedIn token exchange returned `invalid_client` because the wizard sent both `client_secret` and `code_verifier` (PKCE). LinkedIn's Standard/Web app flow uses one or the other, never both. Disabled PKCE for LinkedIn.
- `meta.passthrough.read` (and the other 3 passthrough.read tools) rejected `query.limit: 25` because the Zod schema only accepted strings. Now accepts `string | number | boolean` and coerces to string at request time.
- `meta.targeting.account_search` sent `class=behaviors` to Meta but the endpoint expects `type=behaviors`. Meta silently ignored the wrong param name and returned mixed all-types results. Fixed.
- `linkedin.creatives.list` with a `campaign_id` filter sent the bare param at the top level (silently ignored by LinkedIn) instead of wrapping it in a `search=(campaigns:(values:List(...)))` Rest.li 2.0 expression. Fixed.
- Doc-page drift produced false positives on Meta and Google docs because their HTML embeds per-request volatility (cache-buster URLs in `<link>` preloads, CSP nonces, inline JSON config blobs with session IDs). Hardened `normalizeDocHtml` to rip the entire `<head>` and all tags down to visible text plus strip long hex/numeric tokens. Verified hash-stable on consecutive Meta fetches.

### Changed

- `passthrough.read` and `passthrough.write` descriptions across all 4 platforms reframed from "escape hatch" to "fallback for endpoints without a named tool" with an explicit list of preferred named tools.
- `meta.targeting.search` enum corrected to drop unsupported `/search` types (industries, behaviors, life_events, education, income — these don't work on `/search`) and add the geo + locale types that do (`adgeolocation`, `adcity`, `adzipcode`, `adcountry`, `adcountrygroup`, `adstate`, `adlocale`, `adfamily`).
- `meta.creatives.create_image` call_to_action enum extended from 19 to 39 values (added GET_OFFER_VIEW, USE_MOBILE_APP, PLAY_GAME, WHATSAPP_MESSAGE, CALL_NOW, CALL, BUY_NOW, BUY_TICKETS, ORDER_NOW, GET_DIRECTIONS, OPEN_LINK, FOLLOW_PAGE, FOLLOW_USER, REGISTER_NOW, GET_PROMOTIONS, VOTE_NOW, GET_SHOWTIMES, RAISE_MONEY, plus the LEAD-form CTAs handled correctly).

### Tests

- 184 unit tests passing (was 80 at v0.1.1), 4 platform-gated integration tests skipped by default
- New test files: `DocPageDiff.test.ts` (27), `KeychainStore.test.ts` (5), `OAuth.test.ts` (10), `TokenManager.test.ts` (8), `googleProvider.test.ts` (6), `meta-ads/oauth.test.ts` (4), `linkedin-ads/oauth.test.ts` (5), per-platform registry tests (4 files), `apps/cli/tests/authHint.test.ts` (10), plus expanded coverage on existing modules

### Known limitations carried forward to v0.2.x / Phase 2.5

- Meta long-lived access tokens (~60 days) have no programmatic refresh path. Users re-run the OAuth wizard before expiry. Doctor surfaces the expiry as a 401 with a clear re-auth hint when it happens.
- Token-paste `setup` (the non-OAuth wizard) doesn't write the new `client_id_ref` / `client_secret_ref` / `refresh_token_ref` fields, so token-paste LinkedIn accounts don't get auto-refresh. OAuth-wizard accounts do.
- Long-tail named-tool coverage outside Meta — LinkedIn / Google Ads / GA4 / GSC each have 6-15 named tools. Phase 2.5 will deepen the named coverage on those platforms following the Meta playbook.
- Video / carousel / asset-feed creatives still go through `meta.passthrough.write` (multipart upload tooling not yet built).
- Customer-list custom audiences still go through passthrough (PII upload + match needs a dedicated design pass).

## [0.1.2] — 2026-04-28

LinkedIn analytics now attribute metrics back to human-readable names instead of opaque URNs.

### Added — URN to name resolution
- `packages/linkedin-ads/src/nameResolution.ts`: helpers that fetch campaigns and campaign groups for an account once per analytics call and build a URN to name map
- `linkedin.analytics` tool now accepts `include_names` (default `true`); rows in the `elements` array gain a `pivot_name` field for `CAMPAIGN` and `CAMPAIGN_GROUP` pivots, and the response carries a `name_resolution` status of `"applied"`, `"not_supported"`, or `"skipped"`
- `linkedin.account.overview` tool decorates its `ACCOUNT`-pivot rollup with the account name (free, no extra API call; pulled from the same `accountInfo` payload it already fetches)

### Why this matters
- Before: analytics responses returned `pivotValues: ["urn:li:sponsoredCampaign:519901013"]` with no name. Callers had to make a second round-trip to attribute spend to a campaign.
- After: each row carries `pivot_name: "Q1 awareness, fashion"`, so an LLM can summarize performance directly from one tool call.

### Compatibility
- Fully backward compatible. Set `include_names: false` to restore the old shape (raw URNs only). Pivots without built-in resolvers (`CREATIVE`, `MEMBER_COMPANY`, `MEMBER_INDUSTRY`, `MEMBER_JOB_TITLE`) fall through with `name_resolution: "not_supported"` and raw URNs in `pivotValues` — same behavior as 0.1.1.

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
