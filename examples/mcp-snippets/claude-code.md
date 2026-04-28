# Claude Code / Cowork wiring

Two paths.

## Path 1: as a project-local MCP (no plugin packaging)

Add to your project's `.mcp.json` (or workspace mcp config):

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

Restart Claude Code. The 53 ads-mcp tools should show up in the tool list.

## Path 2: as a .plugin (drag and drop)

A bundled `ads-mcp.plugin` will be produced in Phase 1 Day 7. Until then, use Path 1.
