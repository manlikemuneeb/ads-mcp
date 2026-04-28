# Install ads-mcp in Cursor

Cursor uses MCP for tool calls. Drop a JSON snippet into Cursor's MCP config, restart, and the 53 ads-mcp tools become available.

## Prerequisites

- Node 20+ on PATH
- ads-mcp built locally (`npm install && npm run build`)
- `~/.ads-mcp/config.json` populated via `ads-mcp setup`

## Steps

### 1. Open Cursor's MCP config

```bash
mkdir -p ~/.cursor
open -a TextEdit ~/.cursor/mcp.json
```

If the file doesn't exist, create it.

### 2. Add the ads-mcp entry

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

Replace the path. If `mcpServers` exists, just add the `ads-mcp` key.

### 3. Restart Cursor

Cmd+Q, reopen. Cursor reloads MCP servers on launch.

### 4. Verify

Open Cursor's command palette (Cmd+K or Cmd+L for chat) and ask:

> Use ads-mcp to list my Meta campaigns from the last 30 days.

The tool call should succeed.

## Troubleshooting

Same patterns as Claude Desktop. Check Cursor's developer console (Help → Toggle Developer Tools → Console) for MCP errors. Most common: Node not on PATH for GUI apps; use the absolute path returned by `which node`.
