# `plugin/` directory

This folder contains the source for the `ads-mcp.plugin` bundle that `scripts/build-plugin.sh` produces.

## Status: fallback artifact, not the primary install path

As of v0.2.0, the `.plugin` bundle is **not** the recommended way to install ads-mcp. Claude Desktop's local-plugin upload UI rejects bundles inconsistently (returns "Zip file contains path with invalid characters" regardless of bundle content, name, or zip-byte format). We have not been able to reproduce the rejection with any external zip parser.

The supported install path is **npm + config-file**, documented in:

- [`docs/install/claude-desktop.md`](../docs/install/claude-desktop.md)
- [`docs/install/claude-code.md`](../docs/install/claude-code.md)
- [`docs/install/cursor.md`](../docs/install/cursor.md)
- [`docs/install/cline.md`](../docs/install/cline.md)
- [`docs/install/continue.md`](../docs/install/continue.md)

We continue to build and attach the `.plugin` to GitHub releases so:
1. It activates the day the client plugin uploader stabilizes (no rebuild needed)
2. Other MCP clients with their own plugin loaders (future Cowork, third-party tools) can use it
3. Users who prefer a single-file install have the option

## Layout

```
plugin/
├── .claude-plugin/
│   └── plugin.json   Cowork plugin manifest (name, version, author, keywords)
├── .mcp.json          MCP server registration referencing ${CLAUDE_PLUGIN_ROOT}/servers/install.sh
└── install.sh         Bootstrap script: cd, node-version check, exec node packages/server/dist/index.js
```

Built bundles land in `../release/ads-mcp.plugin`. See `../scripts/build-plugin.sh` for the bundling logic.
