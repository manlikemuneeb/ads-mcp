# Claude Code / Cowork wiring

## Recommended: `claude mcp add` with the published npm package

```bash
npm install -g @manlikemuneeb/ads-mcp-cli
ads-mcp setup --oauth meta
claude mcp add ads-mcp -- npx -y @manlikemuneeb/ads-mcp-server
```

## Alternative: project-local `.mcp.json` against the published package

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

## Development: project-local `.mcp.json` against a local checkout

```json
{
  "mcpServers": {
    "ads-mcp": {
      "command": "node",
      "args": [
        "/Users/YOUR_USERNAME/path/to/ads-mcp/packages/server/dist/index.js"
      ]
    }
  }
}
```

Restart Claude Code. The 89 ads-mcp tools should show up in the tool list.
