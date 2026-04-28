# Install ads-mcp in Cline (VSCode)

Cline manages MCP servers from inside the VSCode extension UI.

## Prerequisites

- Node 20+ on PATH
- ads-mcp built locally
- `~/.ads-mcp/config.json` set up

## Steps

1. Open VSCode → Cline panel (left sidebar).
2. Click the gear icon → **MCP Servers** → **Edit MCP Settings**.
3. Cline opens its MCP config JSON file. Add:

```json
{
  "mcpServers": {
    "ads-mcp": {
      "command": "node",
      "args": [
        "/ABSOLUTE/PATH/TO/ads-mcp/packages/server/dist/index.js"
      ],
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

4. Save. Cline auto-reloads the MCP server.
5. Test in a Cline chat:

> Use ads-mcp to summarize my Meta ad performance for the last 7 days.

## Auto-approve

Cline's `autoApprove` array lists tools that don't require user confirmation per call. For ads-mcp **leave this empty** so every tool call (especially writes) prompts you. Add specific read-only tool names if you trust them:

```json
"autoApprove": [
  "meta.account.overview",
  "meta.campaigns.list",
  "google_ads.query"
]
```

Never auto-approve any `*.pause`, `*.resume`, `*.update_budget`, or `*.passthrough.write` tools without thinking carefully. Dry-run defaults are your safety net but not a replacement for human review on writes.
