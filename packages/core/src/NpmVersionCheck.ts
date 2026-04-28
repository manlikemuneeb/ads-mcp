/**
 * Optional auto-update advisory. Compares the installed version against the npm
 * registry's `latest` tag for `@manlikemuneeb/ads-mcp` (or any package name).
 *
 * Designed to fail silently if:
 *   - The package isn't published yet (registry returns 404)
 *   - User is offline
 *   - Registry rate-limits or otherwise errors
 *
 * Use as a non-blocking nudge from `doctor`: print a one-line note when an
 * upgrade is available, never block the user.
 */

export interface NpmVersionCheckResult {
  package_name: string;
  installed_version: string;
  latest_version?: string;
  update_available: boolean;
  reason?: "ok" | "registry_404" | "network_error" | "parse_error" | "compared";
}

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

export async function checkNpmVersion(
  packageName: string,
  installedVersion: string,
  fetchImpl: FetchFn = globalThis.fetch.bind(globalThis),
  timeoutMs = 3000,
): Promise<NpmVersionCheckResult> {
  const url = `https://registry.npmjs.org/${packageName}/latest`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { signal: controller.signal });
    if (res.status === 404) {
      return {
        package_name: packageName,
        installed_version: installedVersion,
        update_available: false,
        reason: "registry_404",
      };
    }
    if (!res.ok) {
      return {
        package_name: packageName,
        installed_version: installedVersion,
        update_available: false,
        reason: "network_error",
      };
    }
    const data = (await res.json()) as { version?: string };
    if (!data.version) {
      return {
        package_name: packageName,
        installed_version: installedVersion,
        update_available: false,
        reason: "parse_error",
      };
    }
    const latest = data.version;
    return {
      package_name: packageName,
      installed_version: installedVersion,
      latest_version: latest,
      update_available: compareSemver(latest, installedVersion) > 0,
      reason: "compared",
    };
  } catch {
    return {
      package_name: packageName,
      installed_version: installedVersion,
      update_available: false,
      reason: "network_error",
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Minimal semver comparator: returns positive if a > b, negative if a < b, 0 if equal.
 * Handles `MAJOR.MINOR.PATCH`, ignores prerelease tags for the advisory.
 */
export function compareSemver(a: string, b: string): number {
  const [aMain] = a.split("-");
  const [bMain] = b.split("-");
  const ap = (aMain ?? "0").split(".").map((s) => Number.parseInt(s, 10) || 0);
  const bp = (bMain ?? "0").split(".").map((s) => Number.parseInt(s, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((ap[i] ?? 0) > (bp[i] ?? 0)) return 1;
    if ((ap[i] ?? 0) < (bp[i] ?? 0)) return -1;
  }
  return 0;
}
