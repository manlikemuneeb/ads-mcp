import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SecretsManager } from "../src/SecretsManager.js";
import { SecretResolveError } from "../src/types.js";

describe("SecretsManager", () => {
  beforeEach(() => {
    SecretsManager.clearCache();
  });

  it("resolves env refs", async () => {
    process.env.ADS_MCP_TEST_SECRET = "shhh";
    const v = await SecretsManager.resolve({ kind: "env", var: "ADS_MCP_TEST_SECRET" });
    expect(v).toBe("shhh");
  });

  it("throws when env var is missing", async () => {
    delete process.env.ADS_MCP_NOPE;
    await expect(
      SecretsManager.resolve({ kind: "env", var: "ADS_MCP_NOPE" }),
    ).rejects.toBeInstanceOf(SecretResolveError);
  });

  it("resolves file refs and trims trailing whitespace", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ads-mcp-test-"));
    const path = join(dir, "secret.txt");
    writeFileSync(path, "abc123\n", "utf8");
    const v = await SecretsManager.resolve({ kind: "file", path });
    expect(v).toBe("abc123");
  });

  it("resolves inline refs", async () => {
    const v = await SecretsManager.resolve({ kind: "inline", value: "literal" });
    expect(v).toBe("literal");
  });

  it("rejects keychain refs when the entry doesn't exist", async () => {
    // No matching entry exists for this service+key combo, so resolution
    // should fail with a SecretResolveError that names the missing entry.
    // (On hosts without a keychain backend, the same error type is raised
    // with a different message; both branches are acceptable here.)
    await expect(
      SecretsManager.resolve({
        kind: "keychain",
        service: "ads-mcp-test-nonexistent",
        key: `__missing_${Date.now()}__`,
      }),
    ).rejects.toBeInstanceOf(SecretResolveError);
  });

  afterEach(() => {
    delete process.env.ADS_MCP_TEST_SECRET;
  });
});
