#!/bin/bash
# Builds an ads-mcp.plugin bundle (Cowork / Claude Code / Claude Desktop format).
#
# Format reference: matches the working ad-platform-analytics.plugin
# byte-for-byte. The "Upload local plugin" UI in Claude Desktop accepts
# .zip and .plugin files in this layout — NOT MCPB (.mcpb).
#
# Output structure inside the zip (NO top-level wrapper directory):
#   .claude-plugin/plugin.json    (REQUIRED, manifest at zip root)
#   .mcp.json                     (REQUIRED, refs ${CLAUDE_PLUGIN_ROOT}/servers/install.sh)
#   servers/
#     install.sh                  (entry point — execs node)
#     packages/server/dist/index.js  (the actual MCP server)
#     packages/{core,meta-ads,...}/dist/   (compiled monorepo packages)
#     package.json                (root, so workspace deps resolve)
#     node_modules/               (pre-bundled runtime deps)

set -e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STAGE_BASE="$(mktemp -d -t ads-mcp-plugin-XXXXXX)"
STAGING="$STAGE_BASE/ads-mcp"
OUTPUT="${ADS_MCP_PLUGIN_OUTPUT:-$ROOT/release/ads-mcp.plugin}"

echo "==> Staging in $STAGE_BASE"
mkdir -p "$STAGING"
mkdir -p "$ROOT/release"
rm -f "$OUTPUT" 2>/dev/null || true

echo "==> Copying .claude-plugin/plugin.json (Cowork manifest)"
mkdir -p "$STAGING/.claude-plugin"
cp "$ROOT/plugin/.claude-plugin/plugin.json" "$STAGING/.claude-plugin/plugin.json"

echo "==> Copying .mcp.json"
cp "$ROOT/plugin/.mcp.json" "$STAGING/.mcp.json"

echo "==> Creating servers/ directory"
mkdir -p "$STAGING/servers"

echo "==> Copying install.sh (entry point)"
cp "$ROOT/plugin/install.sh" "$STAGING/servers/install.sh"
chmod +x "$STAGING/servers/install.sh"

echo "==> Copying compiled packages into servers/packages"
mkdir -p "$STAGING/servers/packages"
for pkg in core meta-ads linkedin-ads google-ads ga4 gsc server; do
  if [ ! -d "$ROOT/packages/$pkg/dist" ]; then
    echo "[build-plugin] packages/$pkg/dist missing. Run \`npm run build\` first." >&2
    exit 1
  fi
  mkdir -p "$STAGING/servers/packages/$pkg"
  cp    "$ROOT/packages/$pkg/package.json" "$STAGING/servers/packages/$pkg/"
  cp -R "$ROOT/packages/$pkg/dist"         "$STAGING/servers/packages/$pkg/"
  if [ -d "$ROOT/packages/$pkg/fixtures" ]; then
    cp -R "$ROOT/packages/$pkg/fixtures" "$STAGING/servers/packages/$pkg/"
  fi
done

echo "==> Copying root package.json (so workspace deps resolve)"
cp "$ROOT/package.json" "$STAGING/servers/"

echo "==> Copying node_modules into servers/"
cp -R "$ROOT/node_modules" "$STAGING/servers/"

echo "==> Stripping shim/cache directories"
NM="$STAGING/servers/node_modules"
rm -rf "$NM/.bin" 2>/dev/null || true
rm -rf "$NM/.vite" 2>/dev/null || true
rm -rf "$NM/.cache" 2>/dev/null || true
rm -rf "$NM/.vitest" 2>/dev/null || true
rm -rf "$NM/.modules.yaml" 2>/dev/null || true
rm -rf "$NM/.package-lock.json" 2>/dev/null || true

echo "==> Replacing workspace package mirrors with real package content"
# When npm workspaces dedupe, node_modules/@manlikemuneeb/ads-mcp-* may
# contain stale or symlinked versions of our own packages. Replace each
# with the canonical source so downstream imports resolve correctly.
for dir in "$ROOT/packages"/*; do
  [ -d "$dir/dist" ] || continue
  pkg_name=$(node -e "console.log(require('$dir/package.json').name)")
  link="$NM/$pkg_name"
  if [ -L "$link" ] || [ -d "$link" ]; then
    rm -rf "$link"
  fi
  parent_dir="$(dirname "$link")"
  mkdir -p "$parent_dir"
  mkdir -p "$link"
  cp    "$dir/package.json" "$link/"
  cp -R "$dir/dist"         "$link/"
  if [ -d "$dir/fixtures" ]; then
    cp -R "$dir/fixtures" "$link/"
  fi
done

echo "==> Stripping dev-only transitive deps"
for unwanted in \
  typescript vitest vite vite-node @vitest @biomejs @types tsx \
  esbuild @esbuild rollup @rollup \
  @hono @jridgewell @bundled-es-modules @sigstore \
  acorn acorn-walk ansi-regex ansi-styles birpc cac chai check-error \
  cross-spawn debug deep-eql diff estree-walker expect-type \
  fast-xml-parser fdir get-func-name glob is-fullwidth-code-point isexe \
  jackspeak loupe lru-cache magic-string minimatch minipass ms mz \
  nanoid node-which package-json-from-dist path-key path-scurry \
  pathe pathval picocolors picomatch pretty-format react-is \
  shebang-command shebang-regex siginfo source-map-js source-map \
  stackback std-env string-width strip-ansi strip-final-newline \
  tinybench tinyexec tinyglobby tinypool tinyrainbow tinyspy \
  why-is-node-running wrap-ansi yaml yocto-queue \
  git mime postcss assertion-error es-module-lexer get-tsconfig \
  resolve-pkg-maps undici-types \
  ; do
  rm -rf "$NM/$unwanted" 2>/dev/null || true
done

echo "==> Stripping dev artifacts inside remaining packages"
find "$NM" -name "*.md" -delete 2>/dev/null || true
find "$NM" -name "*.map" -delete 2>/dev/null || true
find "$NM" -name "*.tsbuildinfo" -delete 2>/dev/null || true
find "$NM" -name "tsconfig*.json" -delete 2>/dev/null || true
find "$NM" -name "*.test.js" -delete 2>/dev/null || true
find "$NM" -name "*.test.mjs" -delete 2>/dev/null || true
find "$NM" -name "test" -type d -prune -exec rm -rf {} + 2>/dev/null || true
find "$NM" -name "tests" -type d -prune -exec rm -rf {} + 2>/dev/null || true
find "$STAGING/servers/packages" -name "*.tsbuildinfo" -delete 2>/dev/null || true

echo "==> Final symlink sweep"
set +e
find "$STAGING" -type l 2>/dev/null | while read -r symlink; do
  target=$(readlink -f "$symlink" 2>/dev/null)
  if [ -n "$target" ] && [ -e "$target" ]; then
    rm -f "$symlink" 2>/dev/null
    cp -R "$target" "$symlink" 2>/dev/null || true
  else
    rm -f "$symlink" 2>/dev/null
  fi
done
set -e

echo "==> Tightening permissions to match working reference (700/600)"
find "$STAGING" -type d -exec chmod 700 {} +
find "$STAGING" -type f -exec chmod 600 {} +
chmod 700 "$STAGING/servers/install.sh"

echo "==> Zipping (entries at zip root, no symlinks, no -X to preserve UT extras)"
TMP_OUTPUT="$STAGE_BASE/ads-mcp.plugin"
cd "$STAGING"
ENTRIES=()
for entry in .claude-plugin .mcp.json servers; do
  if [ -e "$entry" ]; then
    ENTRIES+=("$entry")
  fi
done
zip -rq "$TMP_OUTPUT" "${ENTRIES[@]}"

echo "==> Moving to $OUTPUT"
rm -f "$OUTPUT" 2>/dev/null || true
mv "$TMP_OUTPUT" "$OUTPUT" 2>/dev/null || cp "$TMP_OUTPUT" "$OUTPUT"

echo "==> Cleaning staging"
rm -rf "$STAGE_BASE"

# Sanity-check: refuse to ship a bundle with symlinks.
SYMLINK_COUNT=$(unzip -l "$OUTPUT" 2>/dev/null | awk '/^l/' | wc -l | tr -d ' ')
if [ "$SYMLINK_COUNT" -gt 0 ]; then
  echo "[build-plugin] WARNING: bundle still contains $SYMLINK_COUNT symlink entries." >&2
fi

# Sanity-check: refuse to ship without a plugin.json at the right path.
if ! unzip -p "$OUTPUT" .claude-plugin/plugin.json >/dev/null 2>&1; then
  echo "[build-plugin] FATAL: .claude-plugin/plugin.json not at zip root." >&2
  exit 1
fi

# Sanity-check: refuse to ship without .mcp.json at the right path.
if ! unzip -p "$OUTPUT" .mcp.json >/dev/null 2>&1; then
  echo "[build-plugin] FATAL: .mcp.json not at zip root." >&2
  exit 1
fi

# Sanity-check: refuse to ship without install.sh at the right path.
if ! unzip -p "$OUTPUT" servers/install.sh >/dev/null 2>&1; then
  echo "[build-plugin] FATAL: servers/install.sh not in bundle." >&2
  exit 1
fi

SIZE=$(du -h "$OUTPUT" | cut -f1)
ENTRIES_COUNT=$(unzip -l "$OUTPUT" 2>/dev/null | tail -1 | awk '{print $2}')
echo ""
echo "==> Done"
echo "    $OUTPUT"
echo "    Size: $SIZE"
echo "    Entries: $ENTRIES_COUNT"
echo ""
echo "Drag this file into Claude Desktop's plugin manager to install."
