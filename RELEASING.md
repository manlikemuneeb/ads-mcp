# Releasing ads-mcp

Cuts a new release: bumps versions, runs tests, publishes to npm, attaches the `.plugin` to a GitHub release.

## Prerequisites (one-time setup)

1. **GitHub repo provisioned** at `github.com/manlikemuneeb/ads-mcp`.
2. **NPM organization** `@manlikemuneeb` created at https://www.npmjs.com/org/manlikemuneeb.
3. **NPM automation token** added as a GitHub secret named `NPM_TOKEN`:
   - Go to https://www.npmjs.com/settings/<your-user>/tokens
   - Generate New Token → "Automation"
   - Copy the token
   - On GitHub: repo → Settings → Secrets and variables → Actions → New repository secret
   - Name: `NPM_TOKEN`, value: paste
4. **Repo settings → Actions → General**: ensure "Read and write permissions" is granted to GITHUB_TOKEN (so the publish workflow can create releases).

## Release procedure

### 1. Verify everything works locally

```bash
git pull
npm install
npm run build
npm test
node apps/cli/dist/index.js doctor --check-drift
```

All tests should pass and drift checks should be green for any account you have configured.

### 2. Bump versions

Update versions across all packages and the plugin manifest:

```bash
# pick the appropriate semver bump
NEW_VERSION="0.1.2"

for f in package.json packages/*/package.json apps/*/package.json plugin/.claude-plugin/plugin.json; do
  sed -i '' "s|\"version\": \"[^\"]*\"|\"version\": \"$NEW_VERSION\"|" "$f"
done

# verify they all match
grep '"version"' package.json packages/*/package.json apps/*/package.json plugin/.claude-plugin/plugin.json
```

### 3. Update CHANGELOG.md

Add a `## [X.Y.Z]` section at the top describing what changed. Follow the existing format.

### 4. Commit and tag

```bash
git add -A
git commit -m "Release v$NEW_VERSION"
git tag "v$NEW_VERSION"
git push origin main
git push origin "v$NEW_VERSION"
```

### 5. The publish workflow runs automatically

Pushing the tag triggers `.github/workflows/publish.yml`. It:

1. Installs and builds
2. Runs full test suite
3. Verifies the tag matches `package.json` version (fails if mismatched)
4. Publishes every workspace package to npm under `@manlikemuneeb/ads-mcp-*`
5. Packs the `.plugin` bundle
6. Creates a GitHub Release with the `.plugin` attached and auto-generated release notes

Watch the Actions tab. Most failures fix themselves on retry.

## Local test publish (dry run)

Before pushing a tag, sanity-check the publish:

```bash
npm publish --workspaces --access public --dry-run
```

Will print what each workspace package would publish. No actual publish happens.

## Rollback

Once a version is on npm you cannot publish over it. To "rollback":

1. Bump to the next patch version
2. Reapply the desired state
3. Release as a new version

(Real rollback via `npm unpublish` is restricted to packages <72 hours old. Avoid relying on it.)

## Versioning policy

- **MAJOR (1.0.0 → 2.0.0):** breaking changes to the tool surface (renamed tools, removed parameters, changed output shapes that downstream callers depend on)
- **MINOR (0.1.0 → 0.2.0):** new tools, new commands, new platforms; non-breaking
- **PATCH (0.1.0 → 0.1.1):** API-version bumps that match upstream platform changes, bug fixes, doc updates

Pre-1.0 we treat any change that requires user re-config as a MINOR bump.
