import { execFile } from "node:child_process";
import { platform } from "node:os";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

/**
 * Cross-platform OS keychain access for ads-mcp secrets.
 *
 * Backends:
 *   - macOS: `security` CLI (Keychain Services)
 *   - Linux: `secret-tool` CLI (libsecret; install with `apt install libsecret-tools`)
 *   - Windows: PowerShell + .NET PasswordVault / CredentialManager
 *
 * Why shell-out instead of a native module: zero npm deps, no node-gyp drama,
 * works across the four AI client install paths (Claude Code plugin, Claude
 * Desktop, Cursor/Cline/Continue, npx). Cost is one process per access (~50ms
 * on macOS), which is fine since each ads-mcp tool call resolves secrets once
 * at boot.
 *
 * Each entry is keyed by (service, key). Convention used by ads-mcp:
 *   service: "ads-mcp"
 *   key:     "<platform>:<account-label>:<purpose>"
 *           e.g. "linkedin:default:refresh_token"
 *                "meta:client_default:access_token"
 */
export class KeychainStore {
  /**
   * Returns the secret value, or null if no entry exists.
   * Throws if the keychain backend itself fails (e.g. user denied access).
   */
  static async get(service: string, key: string): Promise<string | null> {
    switch (platform()) {
      case "darwin":
        return KeychainStore.getDarwin(service, key);
      case "linux":
        return KeychainStore.getLinux(service, key);
      case "win32":
        return KeychainStore.getWindows(service, key);
      default:
        throw new KeychainUnavailableError(
          `OS keychain not supported on ${platform()}; use SecretRef kind 'env' or 'file' instead`,
        );
    }
  }

  /**
   * Stores or replaces a secret. Throws on backend failure.
   */
  static async set(service: string, key: string, value: string): Promise<void> {
    switch (platform()) {
      case "darwin":
        return KeychainStore.setDarwin(service, key, value);
      case "linux":
        return KeychainStore.setLinux(service, key, value);
      case "win32":
        return KeychainStore.setWindows(service, key, value);
      default:
        throw new KeychainUnavailableError(
          `OS keychain not supported on ${platform()}`,
        );
    }
  }

  /**
   * Deletes a secret. No-op if the entry doesn't exist.
   */
  static async delete(service: string, key: string): Promise<void> {
    switch (platform()) {
      case "darwin":
        return KeychainStore.deleteDarwin(service, key);
      case "linux":
        return KeychainStore.deleteLinux(service, key);
      case "win32":
        return KeychainStore.deleteWindows(service, key);
      default:
        throw new KeychainUnavailableError(
          `OS keychain not supported on ${platform()}`,
        );
    }
  }

  /**
   * Checks whether the keychain backend is available on this host.
   * Returns false on a supported OS where the CLI is missing (e.g. Linux
   * without libsecret-tools installed) so callers can fall back gracefully.
   */
  static async isAvailable(): Promise<boolean> {
    try {
      switch (platform()) {
        case "darwin":
          await execFileP("security", ["-h"]);
          return true;
        case "linux":
          await execFileP("secret-tool", ["--version"]);
          return true;
        case "win32":
          // PowerShell ships with Windows; no probe needed beyond OS check.
          return true;
        default:
          return false;
      }
    } catch {
      return false;
    }
  }

  // ------------------ macOS ------------------

  private static async getDarwin(
    service: string,
    key: string,
  ): Promise<string | null> {
    try {
      const { stdout } = await execFileP("security", [
        "find-generic-password",
        "-s",
        service,
        "-a",
        key,
        "-w",
      ]);
      return stdout.replace(/\n$/, "");
    } catch (err) {
      // Exit code 44 = "The specified item could not be found in the keychain"
      const e = err as NodeJS.ErrnoException & { code?: number; stderr?: string };
      if (e.code === 44 || /could not be found/i.test(e.stderr ?? "")) {
        return null;
      }
      throw new KeychainBackendError(
        `security find-generic-password failed: ${e.stderr ?? e.message}`,
      );
    }
  }

  private static async setDarwin(
    service: string,
    key: string,
    value: string,
  ): Promise<void> {
    try {
      // -U updates if the entry already exists.
      await execFileP("security", [
        "add-generic-password",
        "-U",
        "-s",
        service,
        "-a",
        key,
        "-w",
        value,
      ]);
    } catch (err) {
      const e = err as NodeJS.ErrnoException & { stderr?: string };
      throw new KeychainBackendError(
        `security add-generic-password failed: ${e.stderr ?? e.message}`,
      );
    }
  }

  private static async deleteDarwin(
    service: string,
    key: string,
  ): Promise<void> {
    try {
      await execFileP("security", [
        "delete-generic-password",
        "-s",
        service,
        "-a",
        key,
      ]);
    } catch (err) {
      // Exit 44 = not found; treat delete-of-missing as a no-op.
      const e = err as NodeJS.ErrnoException & { code?: number; stderr?: string };
      if (e.code === 44 || /could not be found/i.test(e.stderr ?? "")) return;
      throw new KeychainBackendError(
        `security delete-generic-password failed: ${e.stderr ?? e.message}`,
      );
    }
  }

  // ------------------ Linux ------------------

  private static async getLinux(
    service: string,
    key: string,
  ): Promise<string | null> {
    try {
      const { stdout } = await execFileP("secret-tool", [
        "lookup",
        "service",
        service,
        "account",
        key,
      ]);
      // secret-tool returns the value with no trailing newline normally; trim
      // just in case.
      return stdout.replace(/\n$/, "");
    } catch (err) {
      const e = err as NodeJS.ErrnoException & { code?: number; stderr?: string };
      // secret-tool exits 1 with empty stdout when the key isn't found.
      if (e.code === 1 && !(e.stderr ?? "").trim()) return null;
      if (/no such key|no matching/i.test(e.stderr ?? "")) return null;
      if (e.code === "ENOENT") {
        throw new KeychainUnavailableError(
          "secret-tool not found; install libsecret-tools (e.g. `apt install libsecret-tools`)",
        );
      }
      throw new KeychainBackendError(
        `secret-tool lookup failed: ${e.stderr ?? e.message}`,
      );
    }
  }

  private static async setLinux(
    service: string,
    key: string,
    value: string,
  ): Promise<void> {
    try {
      // secret-tool store reads the value from stdin.
      const child = execFile(
        "secret-tool",
        [
          "store",
          "--label",
          `${service} ${key}`,
          "service",
          service,
          "account",
          key,
        ],
        () => {
          /* completion handled by the promise below */
        },
      );
      child.stdin?.end(value);
      await new Promise<void>((resolve, reject) => {
        child.on("error", (err) => {
          if ((err as NodeJS.ErrnoException).code === "ENOENT") {
            reject(
              new KeychainUnavailableError(
                "secret-tool not found; install libsecret-tools",
              ),
            );
          } else {
            reject(new KeychainBackendError(`secret-tool store error: ${err.message}`));
          }
        });
        child.on("close", (code) => {
          if (code === 0) resolve();
          else reject(new KeychainBackendError(`secret-tool store exit code ${code}`));
        });
      });
    } catch (err) {
      if (err instanceof KeychainBackendError || err instanceof KeychainUnavailableError) {
        throw err;
      }
      const e = err as Error;
      throw new KeychainBackendError(`secret-tool store failed: ${e.message}`);
    }
  }

  private static async deleteLinux(
    service: string,
    key: string,
  ): Promise<void> {
    try {
      await execFileP("secret-tool", [
        "clear",
        "service",
        service,
        "account",
        key,
      ]);
    } catch (err) {
      const e = err as NodeJS.ErrnoException & { code?: number; stderr?: string };
      // secret-tool clear is a no-op when the key doesn't exist (exit 0).
      if (e.code === "ENOENT") {
        throw new KeychainUnavailableError(
          "secret-tool not found; install libsecret-tools",
        );
      }
      throw new KeychainBackendError(
        `secret-tool clear failed: ${e.stderr ?? e.message}`,
      );
    }
  }

  // ------------------ Windows ------------------
  // Uses the Windows Runtime PasswordVault via PowerShell. PasswordVault stores
  // entries in Windows Credential Manager under the "Web Credentials" group.

  private static psGet(service: string, key: string): string {
    return [
      "[Windows.Security.Credentials.PasswordVault,Windows.Security.Credentials,ContentType=WindowsRuntime] | Out-Null;",
      "$vault = New-Object Windows.Security.Credentials.PasswordVault;",
      "try {",
      `  $cred = $vault.Retrieve('${service}', '${key.replace(/'/g, "''")}');`,
      "  $cred.RetrievePassword();",
      "  Write-Output $cred.Password",
      "} catch { exit 44 }",
    ].join(" ");
  }

  private static psSet(service: string, key: string, value: string): string {
    const k = key.replace(/'/g, "''");
    const v = value.replace(/'/g, "''");
    return [
      "[Windows.Security.Credentials.PasswordVault,Windows.Security.Credentials,ContentType=WindowsRuntime] | Out-Null;",
      "$vault = New-Object Windows.Security.Credentials.PasswordVault;",
      `try { $existing = $vault.Retrieve('${service}', '${k}'); $vault.Remove($existing) } catch {};`,
      `$cred = New-Object Windows.Security.Credentials.PasswordCredential('${service}', '${k}', '${v}');`,
      "$vault.Add($cred)",
    ].join(" ");
  }

  private static psDelete(service: string, key: string): string {
    const k = key.replace(/'/g, "''");
    return [
      "[Windows.Security.Credentials.PasswordVault,Windows.Security.Credentials,ContentType=WindowsRuntime] | Out-Null;",
      "$vault = New-Object Windows.Security.Credentials.PasswordVault;",
      `try { $existing = $vault.Retrieve('${service}', '${k}'); $vault.Remove($existing) } catch {}`,
    ].join(" ");
  }

  private static async getWindows(
    service: string,
    key: string,
  ): Promise<string | null> {
    try {
      const { stdout } = await execFileP("powershell", [
        "-NoProfile",
        "-Command",
        KeychainStore.psGet(service, key),
      ]);
      return stdout.replace(/\r?\n$/, "");
    } catch (err) {
      const e = err as NodeJS.ErrnoException & { code?: number; stderr?: string };
      if (e.code === 44) return null;
      throw new KeychainBackendError(
        `PasswordVault.Retrieve failed: ${e.stderr ?? e.message}`,
      );
    }
  }

  private static async setWindows(
    service: string,
    key: string,
    value: string,
  ): Promise<void> {
    try {
      await execFileP("powershell", [
        "-NoProfile",
        "-Command",
        KeychainStore.psSet(service, key, value),
      ]);
    } catch (err) {
      const e = err as NodeJS.ErrnoException & { stderr?: string };
      throw new KeychainBackendError(
        `PasswordVault.Add failed: ${e.stderr ?? e.message}`,
      );
    }
  }

  private static async deleteWindows(
    service: string,
    key: string,
  ): Promise<void> {
    try {
      await execFileP("powershell", [
        "-NoProfile",
        "-Command",
        KeychainStore.psDelete(service, key),
      ]);
    } catch (err) {
      const e = err as NodeJS.ErrnoException & { stderr?: string };
      throw new KeychainBackendError(
        `PasswordVault.Remove failed: ${e.stderr ?? e.message}`,
      );
    }
  }
}

export class KeychainUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KeychainUnavailableError";
  }
}

export class KeychainBackendError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KeychainBackendError";
  }
}
