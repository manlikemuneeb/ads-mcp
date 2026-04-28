# Install ads-mcp in Claude Desktop

Claude Desktop reads MCP server config from a single JSON file. Add ads-mcp as an entry, restart, and the tools appear in the picker.

> **Why config-file install instead of drag-and-drop .plugin?** The .plugin upload UI ships with Claude Desktop but currently rejects bundles inconsistently. The config-file route is the path the Claude Desktop team officially documents, works across every Claude Desktop version, and is what every other MCP server uses. We ship a .plugin in the GitHub release for the day the upload UI stabilizes; for now, follow the steps below.

## Prerequisites

- Node 20+ on PATH (`node --version`)
- A working config at `~/.ads-mcp/config.json` (run `ads-mcp setup` if you haven't)

## Steps

### 1. Open Claude Desktop's config file

```bash
# macOS
open -a TextEdit ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

If the file doesn't exist, create it with `{}` first:

```bash
mkdir -p ~/Library/Application\ Support/Claude
echo '{}' > ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

On Windows: `%APPDATA%\Claude\claude_desktop_config.json`. On Linux: `~/.config/Claude/claude_desktop_config.json`.

### 2. Add the ads-mcp entry

Merge this into the JSON. If `mcpServers` already exists, just add the `ads-mcp` key inside it.

#### Option A — npm install (simplest, recommended)

If you ran `npm install -g @manlikemuneeb/ads-mcp-cli`:

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

`npx` will fetch and cache the server on first launch. No path management.

#### Option B — local source build (development / contributing)

If you cloned the repo and ran `npm install && npm run build`:

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

Replace the path with where you cloned/built the repo. On macOS that's typically `/Users/YOUR_USERNAME/ads-mcp/packages/server/dist/index.js`.

### 3. Quit and relaunch Claude Desktop

**Cmd+Q** to fully quit (closing the window doesn't kill the app), then reopen. Claude Desktop loads MCP servers on startup.

### 4. Verify

In a new conversation, type:

> Use ads-mcp to show me my last 7 days of Meta campaign performance.

You should see Claude call `meta.account.overview` or `meta.campaigns.list`, return the results, and summarize them.

## Troubleshooting

**Tools don't appear.** Check Claude Desktop's logs:

```bash
tail -f ~/Library/Logs/Claude/mcp*.log
```

Common errors:
- `node not found` or `npx not found` → Node isn't on PATH for GUI-launched apps. Set the `command` to the absolute path of `node` or `npx`: `which node` and `which npx` return them (e.g. `/opt/homebrew/bin/node`, `/opt/homebrew/bin/npx`).
- `config error: Config file not found` → run `ads-mcp setup` (or `node /PATH/TO/ads-mcp/apps/cli/dist/index.js setup`) to create one.
- `auth ok` smoke fails → run `ads-mcp doctor` outside Claude Desktop and fix whatever it surfaces (token expired, scope missing, API not enabled, etc.).

**Tools appear but every call returns "auth error".** Your token expired between setup and now. Open `~/.ads-mcp/config.json`, update the `token_ref.value`, restart Claude Desktop.

**Want to enable writes.** Edit `~/.ads-mcp/config.json` and change `"mode": "read"` to `"mode": "read_write"` for the account you want. Set `"default_dry_run": false` if you want writes to actually fire (otherwise every mutation tool returns a dry-run preview). Restart Claude Desktop.
