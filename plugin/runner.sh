#!/bin/bash
# Bootstraps the ads-mcp MCP server when Claude Code/Cowork loads this plugin.
#
# Requires Node 20+ on PATH. (Most installs already have it; if not, install
# via https://nodejs.org or `brew install node`.)
#
# Reads config from $ADS_MCP_CONFIG or ~/.ads-mcp/config.json. Run
# `ads-mcp setup` (from the npm package or the cli/dist binary) to create one.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v node >/dev/null 2>&1; then
  echo "[ads-mcp] node not found on PATH. Install Node 20+ from https://nodejs.org and retry." >&2
  exit 127
fi

NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "[ads-mcp] node $NODE_MAJOR detected; need 20+. Update Node and retry." >&2
  exit 127
fi

exec node "$SCRIPT_DIR/packages/server/dist/index.js"
