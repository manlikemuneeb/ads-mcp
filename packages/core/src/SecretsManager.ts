import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { type SecretRef, SecretResolveError } from "./types.js";

/**
 * Resolves SecretRef pointers to their underlying string values.
 *
 * Backends:
 *   - env: read from process.env
 *   - file: read file contents (trimmed)
 *   - inline: return literal value (warns on every access)
 *   - keychain: deferred to a future revision; throws clearly for now
 *
 * Lazy keychain support is intentional. Adding a native keychain library at
 * scaffold time blocks `npm install` on platforms missing build tools. We will
 * add it as an optional dependency once the rest of the package builds.
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
        throw new SecretResolveError(
          "keychain backend not yet implemented; use kind: 'env' or 'file' for now",
          ref,
        );
      }
    }
  }
}
