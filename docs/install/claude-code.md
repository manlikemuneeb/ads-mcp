# Install ads-mcp in Claude Code / Cowork

Two paths. The `.plugin` is the easiest; the project-local config is the most flexible for development.

## Path 1 (recommended): `.plugin` drag-and-drop

### Build the plugin

```bash
cd /PATH/TO/ads-mcp
npm install
npm run build
npm run pack:plugin
```

This produces `release/ads-mcp.plugin` (about 6 MB). It contains the compiled server, its dependencies, and a runner script. Self-contained except for Node itself, which must be 20+ and on PATH.

### Install

In Claude Code or Cowork:

1. Open the plugin manager (varies by client; in Cowork it's accessible via the menu or settings)
2. Drag `release/ads-mcp.plugin` into the plugin manager window
3. Approve the install

The 53 ads-mcp tools should appear in the available tool list within seconds.

### Update

Re-run `npm run pack:plugin` after pulling changes; uninstall the old plugin and drag the new one. Future versions will support in-place upgrade once we publish to npm.

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

## Verifying

Run any read tool from chat:

> Use ads-mcp's core.diagnose to show server status.

Expected output: a JSON block with each enabled platform, account list (no secrets), and rate-limit usage. If you see "platform not enabled" for everything, your config wasn't found. Run `ads-mcp setup` to create one at `~/.ads-mcp/config.json`.

## Troubleshooting

**Plugin loads but tools don't appear.** Check the runner ran: most clients log MCP startup. Look for "ads-mcp" in the logs. If `runner.sh` complained about Node version, install Node 20+.

**Plugin works in Path 2 but not Path 1.** The `.plugin` bundles a copy of the compiled code at packaging time; if you rebuilt locally, the plugin is stale. Re-run `npm run pack:plugin`.

**`node not found` in the plugin runner.** GUI apps on macOS sometimes don't see your shell PATH. Edit `runner.sh` (inside the unpacked plugin) to use the absolute Node path. Find it via `which node` in your terminal.
