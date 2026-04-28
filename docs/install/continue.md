# Install ads-mcp in Continue.dev

Continue.dev supports MCP via its experimental config block.

## Prerequisites

- Node 20+ on PATH
- ads-mcp built locally
- `~/.ads-mcp/config.json` populated

## Steps

1. Open `~/.continue/config.json`:

```bash
open -a TextEdit ~/.continue/config.json
```

2. Add or merge the `experimental.modelContextProtocolServers` array:

```json
{
  "experimental": {
    "modelContextProtocolServers": [
      {
        "transport": {
          "type": "stdio",
          "command": "node",
          "args": [
            "/ABSOLUTE/PATH/TO/ads-mcp/packages/server/dist/index.js"
          ]
        }
      }
    ]
  }
}
```

3. Reload Continue (in VSCode: Cmd+Shift+P → "Developer: Reload Window").
4. Open a Continue chat and try:

> Use ads-mcp to pull Google Ads campaign performance for the last 7 days.

## Notes

The MCP feature is marked experimental in Continue. Expect minor breaking changes between Continue versions; if the snippet above stops working, check Continue's release notes for the current MCP config shape.
