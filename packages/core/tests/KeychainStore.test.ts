import { platform } from "node:os";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { KeychainStore } from "../src/KeychainStore.js";

// Round-trip tests touch the real OS keychain. They are gated by:
//   1. Platform: darwin or linux only (Windows tests need an interactive
//      desktop session to authorize PasswordVault).
//   2. Backend availability: KeychainStore.isAvailable() — covers Linux hosts
//      without libsecret-tools installed (CI containers, headless servers).
//   3. Opt-in via env: KEYCHAIN_TESTS=1. Skipped by default to keep `npm test`
//      side-effect free on developer machines.
const ENABLED = process.env.KEYCHAIN_TESTS === "1";
const SUPPORTED = platform() === "darwin" || platform() === "linux";

const SERVICE = "ads-mcp-test";
const KEY = `__test_${Date.now()}__`;
const VALUE = "secret-value-with-special-chars: \"quoted\" 'apostrophe' & ampersand";

describe("KeychainStore", () => {
  describe("isAvailable", () => {
    it("returns a boolean", async () => {
      const result = await KeychainStore.isAvailable();
      expect(typeof result).toBe("boolean");
    });
  });

  describe("get / set / delete round trip", () => {
    let canRun = false;

    beforeAll(async () => {
      if (!ENABLED) return;
      if (!SUPPORTED) return;
      canRun = await KeychainStore.isAvailable();
    });

    afterAll(async () => {
      if (canRun) {
        // Best-effort cleanup; safe even if the test failed mid-flight.
        try {
          await KeychainStore.delete(SERVICE, KEY);
        } catch {
          /* ignore */
        }
      }
    });

    it.skipIf(!ENABLED || !SUPPORTED)(
      "stores and retrieves a value verbatim",
      async () => {
        if (!canRun) {
          // Backend missing on a supported OS; skip silently.
          return;
        }
        await KeychainStore.set(SERVICE, KEY, VALUE);
        const got = await KeychainStore.get(SERVICE, KEY);
        expect(got).toBe(VALUE);
      },
    );

    it.skipIf(!ENABLED || !SUPPORTED)(
      "set replaces an existing value",
      async () => {
        if (!canRun) return;
        await KeychainStore.set(SERVICE, KEY, "first");
        await KeychainStore.set(SERVICE, KEY, "second");
        const got = await KeychainStore.get(SERVICE, KEY);
        expect(got).toBe("second");
      },
    );

    it.skipIf(!ENABLED || !SUPPORTED)(
      "get returns null for a missing entry",
      async () => {
        if (!canRun) return;
        const got = await KeychainStore.get(
          SERVICE,
          `__definitely_missing_${Date.now()}__`,
        );
        expect(got).toBeNull();
      },
    );

    it.skipIf(!ENABLED || !SUPPORTED)(
      "delete is a no-op on a missing entry",
      async () => {
        if (!canRun) return;
        await expect(
          KeychainStore.delete(SERVICE, `__missing_${Date.now()}__`),
        ).resolves.toBeUndefined();
      },
    );
  });
});
