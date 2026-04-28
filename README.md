# ads-mcp

**One MCP server. Five ad platforms. Read and write.**

`ads-mcp` is a single Model Context Protocol server that exposes **Meta Ads, LinkedIn Ads, Google Ads, Google Analytics 4, and Google Search Console** as **89 unified tools** for any AI client. Multi-account, dry-run by default, every mutation is audit-logged.

Built for marketers, growth teams, and operators who would rather tell an AI "pause anything underperforming on Meta" than click through five separate consoles.

[![CI](https://github.com/manlikemuneeb/ads-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/manlikemuneeb/ads-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

---

## What you get

- **89 tools** spanning campaign data, ad-set/ad management, creative library, custom audiences, lookalikes, lead-gen forms, pixels, custom conversions, demographics, placements, conversion funnels, action-type breakdowns, audience targeting search, delivery estimates, GA4 reporting + admin, search analytics, URL inspection, and sitemaps
- **Full Meta surface** — 45 named tools cover end-to-end campaign workflows (plan with targeting search and delivery estimate → create campaign / ad set / ad / creative → manage budgets → pull insights → operate via pause/resume/update). Passthrough is now genuine fallback for long-tail endpoints, not the primary path.
- **OAuth wizard** for Meta, LinkedIn, Google — `ads-mcp setup --oauth <platform>` opens browser, captures redirect, stores credentials in your **OS keychain** (macOS Keychain / Linux libsecret / Windows Credential Manager). Tokens never sit in plaintext on disk.
- **Auto-refresh** — when a LinkedIn or Google access token expires, the relevant client transparently refreshes via stored refresh token. No interruption.
- **Write with guard rails** — every mutation is dry-run by default; flip per-account `mode: "read_write"` in config to allow live mutations. `additional_fields` escape hatch on every create/update tool keeps you covered when Meta adds new fields between releases.
- **Multi-account** from day one
- **Audit log** for every mutation attempt at `~/.ads-mcp/audit.log`
- **Doctor command** smoke-pings every enabled platform with live credentials. When a token is revoked or expired, doctor prints the exact `ads-mcp setup --oauth <platform>` command to re-authorize.
- **Drift detection** — `doctor --check-drift` exercises a known-good fixture per platform AND fetches each registered docs page, comparing hashes against `~/.ads-mcp/doc-state.json` so you know when Meta or Google update a documented surface
- **Self-update advisory** — `doctor` notifies you when a newer version is on npm

---

## Quickstart

You'll need:

- **Node 20 or newer** (`node --version` to check, `brew install node` if missing)
- **Credentials for at least one platform** (token for Meta/LinkedIn, OAuth for Google trio)

### Install

#### Option A: npm (recommended for most users)

```bash
npm install -g @manlikemuneeb/ads-mcp-cli
ads-mcp setup
```

Then wire it into your AI client by adding this to your client's MCP config (e.g., `~/Library/Application Support/Claude/claude_desktop_config.json` for Claude Desktop on macOS):

```json
{
  "mcpServers": {
    "ads-mcp": {
      "command": "npx",
      "args": ["-y", "@manlikemuneeb/ads-mcp-server"]
    }
  }
}
```

Restart your client. Per-client install pages below show the exact path and any client-specific options.

#### Option B: from source

```bash
git clone https://github.com/manlikemuneeb/ads-mcp.git
cd ads-mcp
npm install
npm run build
node apps/cli/dist/index.js setup
```

Then add to your client's MCP config with an absolute path to the built server:

```json
{
  "mcpServers": {
    "ads-mcp": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/ads-mcp/packages/server/dist/index.js"]
    }
  }
}
```

### Set up credentials

Two wizards depending on your preference:

**OAuth wizard (recommended)** — opens browser, captures redirect on `http://localhost:8765/`, stores credentials in your OS keychain:

```bash
ads-mcp setup --oauth meta       # Meta Marketing API
ads-mcp setup --oauth linkedin   # LinkedIn Marketing
ads-mcp setup --oauth google     # Google Ads + GA4 + GSC (one OAuth covers all three)
```

Before running, register `http://localhost:8765/` as the redirect URI in each platform's developer portal:
- **Meta**: App Dashboard → Use Cases → Marketing API → Settings → "Valid OAuth Redirect URIs"
- **LinkedIn**: Developer Portal → App → Auth tab → "Authorized redirect URLs for your app"
- **Google**: Cloud Console → APIs & Services → Credentials → OAuth client → "Authorized redirect URIs"

**Token-paste wizard (fallback)** — for cases where OAuth isn't an option:

```bash
ads-mcp setup
```

The wizard asks for credentials and **smoke-tests them live before saving**. Bad tokens are caught at entry, not three commands later.

Per-platform credential acquisition guides:

- **[Meta](docs/auth/meta.md)** — long-lived user token via Graph API Explorer (~5 min, requires Meta dev app with Marketing API)
- **[LinkedIn](docs/auth/linkedin.md)** — OAuth 2.0 token with `r_ads`, `rw_ads`, `r_ads_reporting` scopes (~5 min, requires LinkedIn Marketing Developer Platform)
- **[Google (Ads + GA4 + GSC)](docs/auth/google.md)** — one OAuth grant covers all three Google services (~10 min, requires Google Cloud project + dev token for Ads)

The wizard writes config to `~/.ads-mcp/config.json` with `chmod 600`. OAuth-wizard tokens are stored in your OS keychain (`security` on macOS, `secret-tool` on Linux, PowerShell PasswordVault on Windows). Token-paste tokens are stored inline in the chmod-600 config file.

### Verify

```bash
ads-mcp doctor
```

Expected: green checks for every platform you enabled.

```bash
ads-mcp doctor --check-drift
```

Same as above plus exercises a known-good fixture per platform and reports any API drift vs the pinned schema. Run this monthly or after platform releases.

### Wire into your AI client

Pick the client you use and follow its install page:

| Client | Install guide |
|---|---|
| Claude Code / Cowork | [docs/install/claude-code.md](docs/install/claude-code.md) |
| Claude Desktop | [docs/install/claude-desktop.md](docs/install/claude-desktop.md) |
| Cursor | [docs/install/cursor.md](docs/install/cursor.md) |
| Cline (VSCode) | [docs/install/cline.md](docs/install/cline.md) |
| Continue.dev | [docs/install/continue.md](docs/install/continue.md) |

Snippets for direct copy-paste live in [`examples/mcp-snippets/`](examples/mcp-snippets/).

### Test it works

In your AI client, ask:

> Use ads-mcp to show me my last 7 days of Meta campaign performance.

You should get back impressions, clicks, spend, and CPM/CTR figures pulled live.

---

## Tool surface

| Platform | Tools | API version |
|---|---|---|
| Meta | 45 (20 reads, 23 writes, 2 passthrough) | Graph v25.0 |
| LinkedIn | 11 (4 reads, 5 writes, 2 passthrough) | Marketing 202604 |
| Google Ads | 7 (3 reads, 3 writes, 1 passthrough) | REST v22 |
| GA4 | 17 (11 reads, 4 writes, 2 passthrough) | Data v1beta + Admin v1beta |
| GSC | 9 (6 reads, 3 writes) | webmasters v3 + searchconsole v1 |
| Core | 1 (`core.diagnose`) | n/a |
| **Total** | **89 + diagnose** | |

Full per-tool documentation:
- [`META_TOOL_REFERENCE.md`](META_TOOL_REFERENCE.md) — Meta complete reference
- [`META_TOOL_REFERENCE.xlsx`](META_TOOL_REFERENCE.xlsx) — Excel companion (8 sheets, filterable)

---

## Multi-account config example

`~/.ads-mcp/config.json`:

```json
{
  "version": 1,
  "default_dry_run": true,
  "log_level": "info",
  "audit_log_path": "~/.ads-mcp/audit.log",
  "platforms": {
    "meta": {
      "enabled": true,
      "default_account": "main",
      "accounts": [
        {
          "label": "main",
          "mode": "read_write",
          "ad_account_id": "act_123",
          "token_ref": { "kind": "inline", "value": "EAAU..." }
        },
        {
          "label": "client",
          "mode": "read",
          "ad_account_id": "act_456",
          "token_ref": { "kind": "inline", "value": "EAAU..." }
        }
      ]
    }
  }
}
```

Every tool accepts an `account` parameter that defaults to the platform's `default_account`. Tools refuse to mutate when the targeted account's `mode` is `"read"`.

---

## CLI reference

| Command | Purpose |
|---|---|
| `ads-mcp setup` | Token-paste wizard with per-platform live smoke-test |
| `ads-mcp setup --oauth meta\|linkedin\|google` | OAuth wizard: opens browser, captures redirect, stores credentials in OS keychain |
| `ads-mcp doctor` | Validate config, ping every enabled platform with live credentials, surface npm-update advisory and re-auth hints when tokens are revoked/expired |
| `ads-mcp doctor --check-drift` | Doctor + drift detection: exercises canonical fixtures AND fetches each registered docs page, surfacing schema or documentation changes |
| `ads-mcp check-versions` | Show pinned API versions per platform + run doc-page drift check (returns exit 2 on drift) |
| `ads-mcp check-versions --no-doc-diff` | Same as above without the network-dependent doc-page check |
| `ads-mcp help` | Print help |

---

## Security

- **OAuth-wizard tokens live in your OS keychain** (macOS Keychain, Linux libsecret, Windows Credential Manager) — never written to disk in plaintext. Token-paste tokens are stored at `~/.ads-mcp/config.json` with `chmod 600` (user-only readable).
- **The config file is in `.gitignore`** by default in the user's `~/.ads-mcp/` location, but if you check this repo into your own VCS, ensure your `.gitignore` excludes it.
- **Audit log** at `~/.ads-mcp/audit.log` records every mutation attempt with timestamp, account, parameters, and outcome.
- **Dry-run by default** prevents accidental mutations on first install.
- **Per-account mode toggle** (`read` vs `read_write`) means even with `dry_run: false`, tools refuse to mutate accounts you haven't explicitly opted into.
- **Never paste tokens into the chat.** Use the `setup` wizard, which reads them inline once and writes them to the local config only.

If you discover a security issue, please report via [GitHub Security Advisories](https://github.com/manlikemuneeb/ads-mcp/security/advisories/new).

---

## Architecture

- **TypeScript / Node 20+** monorepo, npm workspaces
- **`@modelcontextprotocol/sdk`** for the stdio transport
- **`zod`** for input validation, doubles as JSON Schema source for tool listings
- Per-platform clients (`MetaClient`, `LinkedInClient`, `GoogleAdsClient`, `Ga4Client`, `GscClient`) handle auth, rate limit, and structured error parsing
- Shared `GoogleOAuth` class refreshes access tokens for the Google trio from one `authorized_user` credentials.json

```
ads-mcp/
├── packages/
│   ├── core/                shared: ConfigManager, RateLimiter, AuditLogger, DryRunGate, GoogleOAuth, DriftChecker, NpmVersionCheck, types
│   ├── meta-ads/            Meta Graph v25
│   ├── linkedin-ads/        LinkedIn Marketing /rest/ at version 202604
│   ├── google-ads/          Google Ads REST v22
│   ├── ga4/                 Data API + Admin API
│   ├── gsc/                 Webmasters v3 + searchconsole v1
│   └── server/              unified MCP entrypoint, stdio transport
├── apps/
│   └── cli/                 ads-mcp setup, doctor, check-versions, help
├── plugin/                  .claude-plugin manifest + .mcp.json + runner.sh (fallback bundle for client plugin uploaders)
├── scripts/
│   └── build-plugin.sh      packs the fallback .plugin bundle
├── docs/
│   ├── install/             one page per AI client (Claude Code, Claude Desktop, Cursor, Cline, Continue)
│   └── auth/                token-acquisition guides per platform
├── examples/mcp-snippets/   ready-to-paste mcp.json blocks
└── tests/                   unit tests (vitest)
```

---

## Development

```bash
git clone https://github.com/manlikemuneeb/ads-mcp.git
cd ads-mcp
npm install
npm run build       # tsc -b across all packages
npm test            # vitest, ~58 assertions
npm run lint        # biome
npm run pack:plugin # produces release/ads-mcp.plugin
```

### Releasing

See [`RELEASING.md`](RELEASING.md). Release procedure: bump versions, push a `v*.*.*` tag, the GitHub Actions workflow handles the rest (npm publish across all workspace packages, GitHub release created with the fallback `.plugin` attached). The supported install path is npm + config-file per `docs/install/*.md`.

---

## Roadmap

**Shipped (v0.1.x):**
- 53-tool surface across 5 platforms
- Multi-account
- Dry-run + audit log
- Setup wizard with live credential validation
- Doctor with drift detection
- npm-update advisory
- npm + config-file install across Claude Desktop, Claude Code, Cursor, Cline, Continue

**Phase 2 (v0.2.x):**
- OAuth wizard replacing token-paste flow
- OS keychain for secret storage
- Automated doc-page diffing in `check-versions`
- Field manifests as JSON imports (currently sit alongside as source-of-truth)
- Named-tool coverage to retire `passthrough.write` for common operations
- Token auto-refresh in the background

---

## Contributing

PRs welcome. See:

- [`CHANGELOG.md`](CHANGELOG.md) for release history
- [`RELEASING.md`](RELEASING.md) for the release process
- [`PROGRESS.md`](PROGRESS.md) for the running build log

If you're adding a new platform:

1. Mirror the structure of `packages/linkedin-ads/`
2. Drop a `fixtures/canonical-request.json` for drift detection
3. Add a per-platform doc to `docs/auth/`
4. Add the platform to the server registry in `packages/server/src/index.ts`
5. Add ConfigManager schema for the platform's account shape in `packages/core/src/types.ts`

---

## License

MIT. See [`LICENSE`](LICENSE).

---

## Author

Built and maintained by [@manlikemuneeb](https://github.com/manlikemuneeb).
