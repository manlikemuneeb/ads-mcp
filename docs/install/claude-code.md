# Install ads-mcp in Claude Code / Cowork

Two paths. The `claude mcp add` CLI is the easiest; the project-local `.mcp.json` is the most flexible for development.

> **A note on the `.plugin` bundle.** As of v0.2.0, Claude clients' local-plugin upload UI rejects bundles inconsistently. The CLI / config-file routes below are the reliable install paths. The `.plugin` is still attached to GitHub releases for the day the upload UI stabilizes.

## Path 1 (recommended): `claude mcp add`

```bash
npm install -g @manlikemuneeb/ads-mcp-cli
ads-mcp setup --oauth meta   # or linkedin / google
claude mcp add ads-mcp -- npx -y @manlikemuneeb/ads-mcp-server
```

Restart Claude Code. The 89 ads-mcp tools appear in the available tool list.

## Path 2: project-local `.mcp.json`

Useful when actively developing ads-mcp itself, since it picks up rebuilds automatically.

In any Claude Code workspace, create `.mcp.json`:

```json
{
  "mcpServers": {
    "ads-mcp": {
      "command": "node",
      "args": [
        "/ABSOLUTE/PATH/TO/ads-mcp/packages/server/dist/index.js"
      ]
    }
  }
}
```

Restart Claude Code in that workspace. Tools appear.

For the published-package version (no local checkout):

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

## Verifying

Run any read tool from chat:

> Use ads-mcp's core.diagnose to show server status.

Expected output: a JSON block with each enabled platform, account list (no secrets), and rate-limit usage. If you see "platform not enabled" for everything, your config wasn't found. Run `ads-mcp setup` to create one at `~/.ads-mcp/config.json`.

## Troubleshooting

**Tools don't appear after `claude mcp add`.** Restart Claude Code. If still missing, run `claude mcp list` to verify the server registered, then `claude mcp logs ads-mcp` (if available) to see startup output.

**`node not found` or `npx not found`.** GUI apps on macOS sometimes don't see your shell PATH. Replace `npx` in the config with the absolute path: `which npx` returns it (e.g. `/opt/homebrew/bin/npx`).

**`config error: Config file not found`.** Run `ads-mcp setup` to create `~/.ads-mcp/config.json`.
