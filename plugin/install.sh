#!/bin/bash
# Bootstraps the ads-mcp MCP server when Claude Code/Cowork loads this plugin.
#
# Convention matches Claude Desktop's expected plugin layout:
#   .claude-plugin/plugin.json     (manifest at zip root)
#   .mcp.json                      (refs servers/install.sh)
#   servers/install.sh             (THIS FILE — entry point)
#   servers/packages/server/dist/index.js  (the actual MCP server)
#   servers/node_modules/          (pre-bundled runtime deps)
#
# Requires Node 20+ on PATH. (Most installs already have it; if not, install
# via https://nodejs.org or `brew install node`.)
#
# Reads config from $ADS_MCP_CONFIG or ~/.ads-mcp/config.json. Run
# `ads-mcp setup` (from the npm package or the cli/dist binary) to create one.

set -e

# cd to our own directory so relative paths resolve correctly.
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "[ads-mcp] node not found on PATH. Install Node 20+ from https://nodejs.org and retry." >&2
  exit 127
fi

NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "[ads-mcp] node $NODE_MAJOR detected; need 20+. Update Node and retry." >&2
  exit 127
fi

# If node_modules is missing (e.g. user expanded a non-bundled copy),
# install runtime deps. Bundles built by scripts/build-plugin.sh ship
# node_modules pre-populated so this branch doesn't fire.
if [ ! -d "node_modules" ]; then
  echo "[ads-mcp] node_modules missing; installing runtime deps..." >&2
  npm install --production --no-audit --no-fund 2>&1 >&2
fi

exec node "packages/server/dist/index.js"
