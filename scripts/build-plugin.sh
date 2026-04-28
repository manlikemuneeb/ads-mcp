#!/bin/bash
# Builds a self-contained ads-mcp.plugin file for Claude Code / Cowork drag-and-drop install.
#
# Inputs (must already be built):
#   packages/*/dist/      compiled JS for every package
#   node_modules/         dependencies (workspace symlinks resolved into the bundle)
#
# Output:
#   release/ads-mcp.plugin    zip with .claude-plugin manifest, .mcp.json, runner.sh,
#                             packages/*/dist, node_modules

set -e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STAGE_BASE="$(mktemp -d -t ads-mcp-plugin-XXXXXX)"
STAGING="$STAGE_BASE/ads-mcp"
# Output path can be overridden via env (useful for sandbox testing).
OUTPUT="${ADS_MCP_PLUGIN_OUTPUT:-$ROOT/release/ads-mcp.plugin}"

echo "==> Staging in $STAGE_BASE"
mkdir -p "$STAGING"
mkdir -p "$ROOT/release"
rm -f "$OUTPUT"

echo "==> Copying plugin manifest and runner"
cp -R "$ROOT/plugin/.claude-plugin" "$STAGING/"
cp    "$ROOT/plugin/.mcp.json"      "$STAGING/"
cp    "$ROOT/plugin/runner.sh"      "$STAGING/"
chmod +x "$STAGING/runner.sh"

echo "==> Copying compiled packages"
mkdir -p "$STAGING/packages"
for pkg in core meta-ads linkedin-ads google-ads ga4 gsc server; do
  if [ ! -d "$ROOT/packages/$pkg/dist" ]; then
    echo "[build-plugin] packages/$pkg/dist missing. Run \`npm run build\` first." >&2
    exit 1
  fi
  mkdir -p "$STAGING/packages/$pkg"
  cp    "$ROOT/packages/$pkg/package.json" "$STAGING/packages/$pkg/"
  cp -R "$ROOT/packages/$pkg/dist"         "$STAGING/packages/$pkg/"
  if [ -d "$ROOT/packages/$pkg/fixtures" ]; then
    cp -R "$ROOT/packages/$pkg/fixtures" "$STAGING/packages/$pkg/"
  fi
done

echo "==> Copying root package.json (so workspace deps resolve)"
cp "$ROOT/package.json" "$STAGING/"

echo "==> Copying node_modules (preserving symlinks first, then resolving workspace ones)"
cp -R "$ROOT/node_modules" "$STAGING/"

echo "==> Replacing workspace symlinks with real copies"
# npm workspace puts symlinks at node_modules/@manlikemuneeb/ads-mcp-* pointing to
# packages/*/  or apps/*/ . Inside the .plugin those relative paths break, so
# replace each symlink with a real copy of the package's dist + package.json.
for entry in core:packages meta-ads:packages linkedin-ads:packages google-ads:packages \
             ga4:packages gsc:packages server:packages cli:apps; do
  pkg="${entry%%:*}"
  parent="${entry##*:}"
  link="$STAGING/node_modules/@manlikemuneeb/ads-mcp-$pkg"
  src="$ROOT/$parent/$pkg"
  if [ -L "$link" ] || [ -d "$link" ]; then
    rm -rf "$link"
  fi
  if [ -d "$src/dist" ]; then
    mkdir -p "$link"
    cp "$src/package.json" "$link/"
    cp -R "$src/dist" "$link/"
  fi
done

echo "==> Trimming dev-only artifacts from node_modules"
for unwanted in typescript vitest @biomejs tsx @vitest @types vite esbuild zod-to-json-schema/.tsbuildinfo; do
  rm -rf "$STAGING/node_modules/$unwanted" 2>/dev/null || true
done
find "$STAGING/node_modules" -name "*.md" -delete 2>/dev/null || true
find "$STAGING/node_modules" -name "*.map" -delete 2>/dev/null || true
find "$STAGING/node_modules" -name "*.tsbuildinfo" -delete 2>/dev/null || true

echo "==> Zipping"
TMP_OUTPUT="$STAGE_BASE/ads-mcp.plugin"
cd "$STAGE_BASE"
zip -rq "$TMP_OUTPUT" ads-mcp

echo "==> Moving to $OUTPUT"
# Force-remove any stale 0-byte file from a previous failed run.
rm -f "$OUTPUT" 2>/dev/null || true
mv "$TMP_OUTPUT" "$OUTPUT" 2>/dev/null || cp "$TMP_OUTPUT" "$OUTPUT"

echo "==> Cleaning staging"
rm -rf "$STAGE_BASE"

SIZE=$(du -h "$OUTPUT" | cut -f1)
echo ""
echo "==> Done"
echo "    $OUTPUT ($SIZE)"
echo ""
echo "Drag this file into Claude Code or Cowork's plugin manager to install."
