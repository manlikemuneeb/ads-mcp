# ads-mcp

**One MCP server. Five ad platforms. Read and write.**

`ads-mcp` is a single Model Context Protocol server that exposes **Meta Ads, LinkedIn Ads, Google Ads, Google Analytics 4, and Google Search Console** as **53 unified tools** for any AI client. Multi-account, dry-run by default, every mutation is audit-logged.

Built for marketers, growth teams, and operators who would rather tell an AI "pause anything underperforming on Meta" than click through five separate consoles.

[![CI](https://github.com/manlikemuneeb/ads-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/manlikemuneeb/ads-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

---

## What you get

- **53 tools** spanning campaign data, demographics, placements, creatives, conversion funnels, audience insights, search analytics, URL inspection, sitemaps, and GA4 reporting
- **Read everything** — named tools cover the common path; per-platform passthrough tools catch the long tail
- **Write with guard rails** — pause, resume, update budgets across Meta, LinkedIn, and Google Ads. Mark conversion events in GA4. Submit sitemaps in GSC. Every write is dry-run by default; flip per-account `mode: "read_write"` in config to allow live mutations.
- **Multi-account** from day one
- **Audit log** for every mutation attempt at `~/.ads-mcp/audit.log`
- **Doctor command** smoke-pings every enabled platform with live credentials so you know the install works before you ask the AI to do anything
- **Drift detection** — `doctor --check-drift` exercises a known-good fixture per platform; surfaces API schema changes the moment they happen
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

#### Option B: Claude Code / Cowork (drag-and-drop)

Download the latest `ads-mcp.plugin` from the [GitHub Releases page](https://github.com/manlikemuneeb/ads-mcp/releases/latest) and drag into your client's plugin manager.

#### Option C: from source

```bash
git clone https://github.com/manlikemuneeb/ads-mcp.git
cd ads-mcp
npm install
npm run build
node apps/cli/dist/index.js setup
```

### Set up credentials

Run the wizard:

```bash
ads-mcp setup
```

For each platform you enable, the wizard asks for the right credentials and **smoke-tests them live before saving**. Bad tokens are caught at entry, not three commands later.

Per-platform credential acquisition guides:

- **[Meta](docs/auth/meta.md)** — long-lived user token via Graph API Explorer (~5 min, requires Meta dev app with Marketing API)
- **[LinkedIn](docs/auth/linkedin.md)** — OAuth 2.0 token with `r_ads`, `rw_ads`, `r_ads_reporting` scopes (~5 min, requires LinkedIn Marketing Developer Platform)
- **[Google (Ads + GA4 + GSC)](docs/auth/google.md)** — one OAuth grant covers all three Google services (~10 min, requires Google Cloud project + dev token for Ads)

The wizard writes config to `~/.ads-mcp/config.json` with `chmod 600`. Tokens are stored inline in this file in v0.1; OS keychain integration is planned for v0.2.

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
| Meta | 14 (9 reads, 3 writes, 2 passthrough) | Graph v25.0 |
| LinkedIn | 8 (3 reads, 3 writes, 2 passthrough) | Marketing 202604 |
| Google Ads | 6 (1 universal GAQL + 5 named) | REST v22 |
| GA4 | 15 (11 reads, 2 writes, 2 passthrough) | Data v1beta + Admin v1beta |
| GSC | 9 (6 reads, 3 writes) | webmasters v3 + searchconsole v1 |
| Core | 1 (`core.diagnose`) | n/a |
| **Total** | **53 + diagnose** | |

Full per-tool documentation: [`docs/reference/`](docs/reference/) (work in progress).

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
| `ads-mcp setup` | Interactive wizard with per-platform live smoke-test |
| `ads-mcp doctor` | Validate config, ping every enabled platform with live credentials, surface npm-update advisory |
| `ads-mcp doctor --check-drift` | Doctor + drift detection: exercises canonical fixtures and reports any response-shape changes vs the pinned schema |
| `ads-mcp check-versions` | Show pinned API versions per platform with doc URLs to verify currency |
| `ads-mcp help` | Print help |

---

## Security

- **Tokens are stored at `~/.ads-mcp/config.json` with `chmod 600`** (user-only readable). v0.2 will add OS keychain integration.
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
├── plugin/                  .claude-plugin manifest + .mcp.json + runner.sh
├── scripts/
│   └── build-plugin.sh      packs everything into a drag-and-drop .plugin
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

See [`RELEASING.md`](RELEASING.md). Release procedure: bump versions, push a `v*.*.*` tag, the GitHub Actions workflow handles the rest (npm publish + GitHub release with `.plugin` attached).

---

## Roadmap

**Shipped (v0.1.x):**
- 53-tool surface across 5 platforms
- Multi-account
- Dry-run + audit log
- Setup wizard with live credential validation
- Doctor with drift detection
- npm-update advisory
- Drag-and-drop .plugin for Claude Code / Cowork

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
