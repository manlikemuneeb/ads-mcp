import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuditLogger } from "../src/AuditLogger.js";
import { KeychainStore } from "../src/KeychainStore.js";
import { SecretsManager } from "../src/SecretsManager.js";
import { TokenManager } from "../src/TokenManager.js";
import type { OAuthClientCredentials, OAuthTokens } from "../src/OAuth/types.js";

// Helpers ------------------------------------------------------------------

function inlineRef(value: string) {
  return { kind: "inline", value } as const;
}

function makeRefreshFn(impls: Array<() => Promise<OAuthTokens>>) {
  let i = 0;
  const calls: Array<{ creds: OAuthClientCredentials; refresh: string }> = [];
  const fn = async (creds: OAuthClientCredentials, refresh: string) => {
    calls.push({ creds, refresh });
    const impl = impls[i++] ?? impls[impls.length - 1]!;
    return impl();
  };
  return { fn, calls };
}

// Tests --------------------------------------------------------------------

describe("TokenManager", () => {
  beforeEach(() => {
    SecretsManager.clearCache();
  });

  it("returns the cached access token until it nears expiry", async () => {
    const refresh = makeRefreshFn([
      async () => ({
        access_token: "ACCESS_1",
        expires_at: Date.now() + 3600_000, // 1 hour from now
      }),
    ]);
    const tm = new TokenManager({
      platform: "linkedin",
      accountLabel: "test",
      refreshTokenRef: inlineRef("REFRESH_TOKEN"),
      clientIdRef: inlineRef("client-id"),
      clientSecretRef: inlineRef("client-secret"),
      refreshFn: refresh.fn,
    });
    const t1 = await tm.getAccessToken();
    const t2 = await tm.getAccessToken();
    const t3 = await tm.getAccessToken();
    expect(t1).toBe("ACCESS_1");
    expect(t2).toBe("ACCESS_1");
    expect(t3).toBe("ACCESS_1");
    // Only one network call, even though we called getAccessToken 3 times.
    expect(refresh.calls.length).toBe(1);
    expect(refresh.calls[0]?.creds.client_id).toBe("client-id");
    expect(refresh.calls[0]?.creds.client_secret).toBe("client-secret");
    expect(refresh.calls[0]?.refresh).toBe("REFRESH_TOKEN");
  });

  it("refreshes again when the cached token is within 60s of expiry", async () => {
    const refresh = makeRefreshFn([
      async () => ({
        access_token: "ACCESS_1",
        // Expires 30s from now, which is inside the 60s safety margin.
        expires_at: Date.now() + 30_000,
      }),
      async () => ({
        access_token: "ACCESS_2",
        expires_at: Date.now() + 3600_000,
      }),
    ]);
    const tm = new TokenManager({
      platform: "linkedin",
      accountLabel: "test",
      refreshTokenRef: inlineRef("RT"),
      clientIdRef: inlineRef("c"),
      clientSecretRef: inlineRef("s"),
      refreshFn: refresh.fn,
    });
    expect(await tm.getAccessToken()).toBe("ACCESS_1");
    expect(await tm.getAccessToken()).toBe("ACCESS_2");
    expect(refresh.calls.length).toBe(2);
  });

  it("invalidate() forces a refresh on the next call", async () => {
    const refresh = makeRefreshFn([
      async () => ({ access_token: "A1", expires_at: Date.now() + 3600_000 }),
      async () => ({ access_token: "A2", expires_at: Date.now() + 3600_000 }),
    ]);
    const tm = new TokenManager({
      platform: "linkedin",
      accountLabel: "test",
      refreshTokenRef: inlineRef("RT"),
      clientIdRef: inlineRef("c"),
      clientSecretRef: inlineRef("s"),
      refreshFn: refresh.fn,
    });
    expect(await tm.getAccessToken()).toBe("A1");
    tm.invalidate();
    expect(await tm.getAccessToken()).toBe("A2");
  });

  it("dedupes concurrent refreshes", async () => {
    let concurrent = 0;
    let peakConcurrent = 0;
    const refresh = makeRefreshFn([
      async () => {
        concurrent++;
        peakConcurrent = Math.max(peakConcurrent, concurrent);
        await new Promise((r) => setTimeout(r, 30));
        concurrent--;
        return { access_token: "ACCESS", expires_at: Date.now() + 3600_000 };
      },
    ]);
    const tm = new TokenManager({
      platform: "linkedin",
      accountLabel: "test",
      refreshTokenRef: inlineRef("RT"),
      clientIdRef: inlineRef("c"),
      clientSecretRef: inlineRef("s"),
      refreshFn: refresh.fn,
    });
    // Fire 5 concurrent getAccessToken calls before the first finishes.
    const results = await Promise.all([
      tm.getAccessToken(),
      tm.getAccessToken(),
      tm.getAccessToken(),
      tm.getAccessToken(),
      tm.getAccessToken(),
    ]);
    expect(results.every((r) => r === "ACCESS")).toBe(true);
    expect(refresh.calls.length).toBe(1);
    expect(peakConcurrent).toBe(1);
  });

  it("treats undefined expires_at as 'fresh' (provider didn't share expiry)", async () => {
    const refresh = makeRefreshFn([
      async () => ({ access_token: "A_NO_EXPIRY" }),
    ]);
    const tm = new TokenManager({
      platform: "linkedin",
      accountLabel: "test",
      refreshTokenRef: inlineRef("RT"),
      clientIdRef: inlineRef("c"),
      clientSecretRef: inlineRef("s"),
      refreshFn: refresh.fn,
    });
    expect(await tm.getAccessToken()).toBe("A_NO_EXPIRY");
    expect(await tm.getAccessToken()).toBe("A_NO_EXPIRY");
    expect(refresh.calls.length).toBe(1);
  });

  it("persists rotated refresh tokens back to the keychain", async () => {
    // Spy on KeychainStore.set so we can assert it was called.
    const setSpy = vi
      .spyOn(KeychainStore, "set")
      .mockResolvedValue(undefined);
    const refresh = makeRefreshFn([
      async () => ({
        access_token: "ACCESS",
        refresh_token: "ROTATED_REFRESH",
        expires_at: Date.now() + 3600_000,
      }),
    ]);
    const tm = new TokenManager({
      platform: "linkedin",
      accountLabel: "test",
      refreshTokenRef: {
        kind: "keychain",
        service: "ads-mcp",
        key: "linkedin:test:refresh_token",
      },
      clientIdRef: inlineRef("c"),
      clientSecretRef: inlineRef("s"),
      refreshFn: async (creds, rt) => {
        // Manually drive the refreshFn since SecretsManager.resolve will
        // try to hit the keychain. We override the SecretsManager spy.
        return refresh.fn(creds, rt);
      },
    });

    // Stub SecretsManager.resolve so it returns the refresh token without
    // touching the real keychain.
    const resolveSpy = vi
      .spyOn(SecretsManager, "resolve")
      .mockImplementation(async (ref) => {
        if (ref.kind === "keychain") return "ORIGINAL_REFRESH";
        if (ref.kind === "inline") return ref.value;
        throw new Error(`unexpected ref kind: ${ref.kind}`);
      });

    await tm.getAccessToken();

    expect(setSpy).toHaveBeenCalledWith(
      "ads-mcp",
      "linkedin:test:refresh_token",
      "ROTATED_REFRESH",
    );
    setSpy.mockRestore();
    resolveSpy.mockRestore();
  });

  it("does not write to keychain when the refresh token didn't rotate", async () => {
    const setSpy = vi
      .spyOn(KeychainStore, "set")
      .mockResolvedValue(undefined);
    const refresh = makeRefreshFn([
      async () => ({
        access_token: "ACCESS",
        // Same as the existing refresh_token; no rotation.
        refresh_token: "ORIGINAL_REFRESH",
        expires_at: Date.now() + 3600_000,
      }),
    ]);
    const resolveSpy = vi
      .spyOn(SecretsManager, "resolve")
      .mockImplementation(async (ref) => {
        if (ref.kind === "keychain") return "ORIGINAL_REFRESH";
        if (ref.kind === "inline") return ref.value;
        throw new Error("nope");
      });
    const tm = new TokenManager({
      platform: "linkedin",
      accountLabel: "test",
      refreshTokenRef: {
        kind: "keychain",
        service: "ads-mcp",
        key: "linkedin:test:refresh_token",
      },
      clientIdRef: inlineRef("c"),
      clientSecretRef: inlineRef("s"),
      refreshFn: refresh.fn,
    });
    await tm.getAccessToken();
    expect(setSpy).not.toHaveBeenCalled();
    setSpy.mockRestore();
    resolveSpy.mockRestore();
  });

  it("logs a token.refresh entry when an audit logger is provided", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ads-mcp-tm-"));
    const logger = new AuditLogger(join(dir, "audit.log"));
    const logSpy = vi.spyOn(logger, "log");
    const refresh = makeRefreshFn([
      async () => ({
        access_token: "A",
        expires_at: Date.now() + 3600_000,
      }),
    ]);
    const tm = new TokenManager({
      platform: "meta",
      accountLabel: "default",
      refreshTokenRef: inlineRef("RT"),
      clientIdRef: inlineRef("c"),
      clientSecretRef: inlineRef("s"),
      refreshFn: refresh.fn,
      auditLogger: logger,
    });
    await tm.getAccessToken();
    expect(logSpy).toHaveBeenCalledOnce();
    const entry = logSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(entry.tool).toBe("token.refresh");
    expect(entry.platform).toBe("meta");
    expect(entry.account).toBe("default");
    expect(entry.outcome).toBe("live_success");
    expect(entry.dry_run).toBe(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
});
