# Install ads-mcp in Claude Desktop

Claude Desktop reads MCP server config from a single JSON file. Add ads-mcp as an entry, restart, and the tools appear in the picker.

## Prerequisites

- Node 20+ on PATH (`node --version`)
- ads-mcp built locally with `npm install && npm run build`
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
- `node not found` → Node isn't on PATH for GUI-launched apps. Set the `command` to the absolute path of `node`: `which node` returns it (e.g. `/opt/homebrew/bin/node` or `/usr/local/bin/node`).
- `config error: Config file not found` → run `node /PATH/TO/ads-mcp/apps/cli/dist/index.js setup` to create one.
- `auth ok` smoke fails → run `node /PATH/TO/ads-mcp/apps/cli/dist/index.js doctor` outside Claude Desktop and fix whatever it surfaces (token expired, scope missing, API not enabled, etc.).

**Tools appear but every call returns "auth error".** Your token expired between setup and now. Open `~/.ads-mcp/config.json`, update the `token_ref.value`, restart Claude Desktop.

**Want to enable writes.** Edit `~/.ads-mcp/config.json` and change `"mode": "read"` to `"mode": "read_write"` for the account you want. Set `"default_dry_run": false` if you want writes to actually fire (otherwise every mutation tool returns a dry-run preview). Restart Claude Desktop.
