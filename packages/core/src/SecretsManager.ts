import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { KeychainStore, KeychainUnavailableError } from "./KeychainStore.js";
import { type SecretRef, SecretResolveError } from "./types.js";

/**
 * Resolves SecretRef pointers to their underlying string values.
 *
 * Backends:
 *   - env: read from process.env
 *   - file: read file contents (trimmed)
 *   - inline: return literal value (discouraged)
 *   - keychain: read from OS keychain via KeychainStore (macOS Keychain,
 *               Linux libsecret, Windows Credential Manager)
 *
 * The keychain backend uses shell-out to OS-native CLIs (`security`,
 * `secret-tool`, PowerShell PasswordVault), so it works without any
 * native npm dependency.
 */
export class SecretsManager {
  private static cache = new Map<string, string>();

  static async resolve(ref: SecretRef): Promise<string> {
    const cacheKey = JSON.stringify(ref);
    const cached = SecretsManager.cache.get(cacheKey);
    if (cached !== undefined) return cached;

    const value = await SecretsManager.resolveUncached(ref);
    SecretsManager.cache.set(cacheKey, value);
    return value;
  }

  static clearCache(): void {
    SecretsManager.cache.clear();
  }

  private static async resolveUncached(ref: SecretRef): Promise<string> {
    switch (ref.kind) {
      case "env": {
        const v = process.env[ref.var];
        if (v === undefined || v === "") {
          throw new SecretResolveError(`env var ${ref.var} not set or empty`, ref);
        }
        return v;
      }
      case "file": {
        const path = ref.path.startsWith("~")
          ? resolve(homedir(), ref.path.slice(2))
          : resolve(ref.path);
        try {
          const raw = await readFile(path, "utf8");
          return raw.trim();
        } catch (err) {
          throw new SecretResolveError(
            `failed to read secret from ${path}: ${(err as Error).message}`,
            ref,
          );
        }
      }
      case "inline": {
        // Discouraged but supported. We intentionally do not log the value.
        return ref.value;
      }
      case "keychain": {
        try {
          const value = await KeychainStore.get(ref.service, ref.key);
          if (value === null || value === "") {
            throw new SecretResolveError(
              `keychain entry not found: service='${ref.service}', key='${ref.key}'. Run \`ads-mcp setup --oauth <platform>\` to create it, or switch this account to kind: 'env' / 'file'.`,
              ref,
            );
          }
          return value;
        } catch (err) {
          if (err instanceof SecretResolveError) throw err;
          if (err instanceof KeychainUnavailableError) {
            throw new SecretResolveError(
              `keychain backend unavailable: ${err.message}`,
              ref,
            );
          }
          throw new SecretResolveError(
            `keychain access failed: ${(err as Error).message}`,
            ref,
          );
        }
      }
    }
  }
}
