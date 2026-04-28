import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile, chmod } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import {
  AdsMcpConfigSchema,
  KeychainStore,
  type AdsMcpConfig,
  type OAuthTokens,
  refreshGoogleAccessToken,
  runGoogleOAuthFlow,
} from "@manlikemuneeb/ads-mcp-core";
import {
  refreshLinkedInAccessToken,
  runLinkedInOAuthFlow,
} from "@manlikemuneeb/ads-mcp-linkedin";
import { runMetaOAuthFlow } from "@manlikemuneeb/ads-mcp-meta";
import {
  ask,
  askChoice,
  askOptional,
  askSecret,
  askYesNo,
  closeRl,
  failure,
  header,
  info,
  success,
} from "./prompt.js";

const DEFAULT_CONFIG_PATH = resolve(homedir(), ".ads-mcp", "config.json");
const KEYCHAIN_SERVICE = "ads-mcp";

type Platform = "meta" | "linkedin" | "google";

interface OAuthSetupOptions {
  platform: Platform;
  configPath?: string;
}

/**
 * Top-level entry point for `ads-mcp setup --oauth <platform>`.
 *
 * Flow:
 *   1. Confirm prerequisites (OS keychain available, app credentials known).
 *   2. Prompt for client_id, client_secret, redirect URI, account label.
 *   3. Run platform OAuth flow via local loopback redirect.
 *   4. Store refresh_token (or long-lived access_token for Meta) in OS keychain.
 *   5. Patch ~/.ads-mcp/config.json to add an account entry that points at
 *      the keychain via `token_ref: { kind: "keychain", service, key }`.
 */
export async function runOAuthSetup(
  options: OAuthSetupOptions,
): Promise<void> {
  const { platform } = options;
  const configPath = options.configPath ?? DEFAULT_CONFIG_PATH;

  header(`ads-mcp OAuth wizard — ${platform}`);
  info(
    "This walks you through authorizing your OAuth app and storing the resulting",
  );
  info("refresh token in your OS keychain. Your token never touches disk in plaintext.\n");

  // 1. Check keychain availability up front so we fail fast.
  const available = await KeychainStore.isAvailable();
  if (!available) {
    failure(
      "OS keychain backend not available on this host.",
    );
    info(
      "  - macOS: `security` should already be installed (system tool).",
    );
    info(
      "  - Linux: install libsecret-tools (`sudo apt install libsecret-tools`)",
    );
    info(
      "  - Windows: PowerShell + WinRT PasswordVault is required.",
    );
    info(
      "Alternatively, set up this account using kind: 'env' or 'file' via `ads-mcp setup`.",
    );
    closeRl();
    process.exit(1);
  }
  success("OS keychain is reachable.");

  // 2. Collect inputs.
  const label = await ask(
    `Account label for this ${platform} setup`,
    "default",
  );
  const clientId = await ask(`${platform} OAuth client_id`);
  const clientSecret = await askSecret(`${platform} OAuth client_secret`);

  // The redirect URI is the part most likely to bite users — providers do
  // exact string matching against what's registered in their dev portal.
  // We default to http://localhost:8765/ because that's the most common
  // convention; Meta and LinkedIn require an exact match, so a stable
  // port is essential. Google accepts any loopback port, but using the
  // same default keeps the wizard simple and consistent.
  info("");
  info(
    "  ⚠ The redirect URI must EXACTLY match what's registered in your app's OAuth settings.",
  );
  switch (platform) {
    case "meta":
      info(
        "    Meta: register http://localhost:8765/ in your App Dashboard → Use Cases → Marketing API → Settings → 'Valid OAuth Redirect URIs'.",
      );
      break;
    case "linkedin":
      info(
        "    LinkedIn: register http://localhost:8765/ in your Developer Portal → App → Auth tab → 'Authorized redirect URLs for your app'.",
      );
      break;
    case "google":
      info(
        "    Google: register http://localhost:8765/ in Google Cloud Console → APIs & Services → Credentials → your OAuth client → 'Authorized redirect URIs'.",
      );
      break;
  }
  info("");
  const redirectUri = await ask(
    "Redirect URI (this exact string is what gets sent to the provider)",
    "http://localhost:8765/",
  );
  const portStr = await askOptional("Local port", "8765");
  const localPort = portStr ? Number(portStr) : 8765;
  // Sanity check: if the user kept the {PORT} placeholder default, fill it in.
  // (Preserves the original placeholder behavior for power users who paste a
  // template URI.)
  const finalRedirectUri = redirectUri.replace("{PORT}", String(localPort));
  if (finalRedirectUri !== redirectUri) {
    info(`  Resolved redirect URI: ${finalRedirectUri}`);
  }
  // Soft warning when host + port don't match conventions — most users will
  // hit the LinkedIn "redirect_uri does not match" error if these drift.
  if (
    !finalRedirectUri.includes("localhost") &&
    !finalRedirectUri.includes("127.0.0.1")
  ) {
    info(
      "  ⚠ Heads up: most providers only accept loopback redirect URIs (localhost / 127.0.0.1) for desktop OAuth. Public hostnames generally need an HTTPS URI registered as a 'Web' OAuth client type.",
    );
  }

  // 3. Per-platform extras.
  let extras: PlatformExtras;
  switch (platform) {
    case "meta":
      extras = await collectMetaExtras();
      break;
    case "linkedin":
      extras = await collectLinkedInExtras();
      break;
    case "google":
      extras = await collectGoogleExtras();
      break;
  }

  // 4. Run the OAuth flow.
  info("\nOpening your browser to authorize...\n");
  let tokens: OAuthTokens;
  try {
    tokens = await runFlowForPlatform(platform, {
      clientId,
      clientSecret,
      redirectUri: finalRedirectUri,
      localPort,
      onAuthorizeUrl: async (url) => {
        info("Authorize URL (also opening in browser if available):");
        info(`  ${url}`);
        await openInBrowser(url);
      },
      ...(extras.flowExtras ?? {}),
    });
  } catch (err) {
    failure(`OAuth flow failed: ${(err as Error).message}`);
    closeRl();
    process.exit(1);
  }
  success("OAuth flow completed.");

  // 5. Store the durable secret in keychain.
  // Each platform has a different consumer:
  //   - Meta: MetaClient reads token_ref via SecretsManager -> a raw long-lived
  //     access token string. Store the access_token verbatim.
  //   - LinkedIn: LinkedInClient reads refresh_token_ref + client_id_ref +
  //     client_secret_ref through TokenManager -> raw refresh token.
  //   - Google: GoogleOAuth.ts (used by Google Ads / GA4 / GSC) reads a single
  //     `oauth_credentials_ref` and JSON.parses it as the canonical
  //     `authorized_user` credentials.json shape. Serialize accordingly.
  let keychainKey: string;
  let keychainValue: string;
  switch (platform) {
    case "meta": {
      if (!tokens.access_token) {
        failure("Meta OAuth returned no access_token.");
        closeRl();
        process.exit(1);
      }
      keychainKey = `${platform}:${label}:access_token`;
      keychainValue = tokens.access_token;
      break;
    }
    case "linkedin": {
      const refresh = tokens.refresh_token;
      if (!refresh) {
        failure(
          "LinkedIn OAuth returned no refresh_token. Confirm your app has Marketing Developer Platform access and the right scopes.",
        );
        closeRl();
        process.exit(1);
      }
      keychainKey = `${platform}:${label}:refresh_token`;
      keychainValue = refresh;
      break;
    }
    case "google": {
      const refresh = tokens.refresh_token;
      if (!refresh) {
        failure(
          "Google OAuth returned no refresh_token. The provider config requests access_type=offline and prompt=consent, " +
            "so this usually means the Google Cloud OAuth client is misconfigured (try regenerating it as a 'Desktop app' or 'Web application' with the correct redirect URI).",
        );
        closeRl();
        process.exit(1);
      }
      // GoogleOAuth.ts canonical shape — preserved here so the existing
      // refresh path continues to work without changes.
      keychainKey = `${platform}:${label}:credentials_json`;
      keychainValue = JSON.stringify({
        type: "authorized_user",
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refresh,
      });
      break;
    }
  }
  await KeychainStore.set(KEYCHAIN_SERVICE, keychainKey, keychainValue);
  success(`Stored ${keychainKey} in OS keychain.`);

  // For LinkedIn, TokenManager needs client_secret separately at refresh time.
  // (Meta doesn't refresh; Google bundles client_secret into the JSON blob.)
  if (platform === "linkedin") {
    const secretKey = `${platform}:${label}:client_secret`;
    await KeychainStore.set(KEYCHAIN_SERVICE, secretKey, clientSecret);
    success(`Stored ${secretKey} in OS keychain.`);
  }

  // For LinkedIn, also stash the client_secret keychain key so patchConfig
  // can wire client_secret_ref correctly.
  const linkedinClientSecretKey =
    platform === "linkedin" ? `${platform}:${label}:client_secret` : undefined;

  // 6. Patch the config file.
  await patchConfig(configPath, {
    platform,
    label,
    clientId,
    keychainKey,
    extras,
    ...(linkedinClientSecretKey !== undefined
      ? { linkedinClientSecretKey }
      : {}),
  });
  success(`Patched ${configPath}.`);

  info("\nDone. Next steps:");
  info("  - Run `ads-mcp doctor` to verify the new account.");
  info("  - Wire ads-mcp into your AI client per docs/install/.");
  closeRl();
}

interface PlatformExtras {
  flowExtras?: { enableWrites?: boolean; scopes?: string[] };
  account: Record<string, string | undefined>;
}

async function collectMetaExtras(): Promise<PlatformExtras> {
  const adAccountId = await ask(
    "Meta ad_account_id (act_XXXXXXXXX or just digits)",
  );
  const businessId = await askOptional("Meta business_id (optional)");
  const account: Record<string, string | undefined> = { ad_account_id: adAccountId };
  if (businessId !== undefined) account.business_id = businessId;
  return { account };
}

async function collectLinkedInExtras(): Promise<PlatformExtras> {
  const adAccountId = await ask("LinkedIn ad_account_id (numeric)");
  const orgId = await askOptional("LinkedIn organization_id (optional)");
  const enableWrites = await askYesNo(
    "Request rw_ads (write) scope? Requires Marketing Developer Platform partner approval.",
    true,
  );
  const account: Record<string, string | undefined> = { ad_account_id: adAccountId };
  if (orgId !== undefined) account.organization_id = orgId;
  return {
    flowExtras: { enableWrites },
    account,
  };
}

async function collectGoogleExtras(): Promise<PlatformExtras> {
  const product = await askChoice(
    "Which Google product is this account for?",
    ["google_ads", "ga4", "gsc"] as const,
    "google_ads",
  );
  const account: Record<string, string | undefined> = {};
  if (product === "google_ads") {
    account.customer_id = await ask("Google Ads customer_id (10 digits, no dashes)");
    const loginCustomerId = await askOptional(
      "Google Ads login_customer_id (manager account, optional)",
    );
    if (loginCustomerId !== undefined) account.login_customer_id = loginCustomerId;
    account.developer_token = await askSecret("Google Ads developer_token");
  } else if (product === "ga4") {
    account.property_id = await ask("GA4 property_id (numeric)");
  } else {
    account.site_url = await ask(
      "GSC site_url (e.g. https://example.com/ or sc-domain:example.com)",
    );
  }
  account._google_product = product;
  return { account };
}

async function runFlowForPlatform(
  platform: Platform,
  args: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    localPort?: number;
    onAuthorizeUrl: (url: string) => Promise<void> | void;
    enableWrites?: boolean;
    scopes?: string[];
  },
): Promise<OAuthTokens> {
  const credentials = { client_id: args.clientId, client_secret: args.clientSecret };
  const common = {
    credentials,
    redirectUri: args.redirectUri,
    ...(args.localPort !== undefined ? { localPort: args.localPort } : {}),
    onAuthorizeUrl: args.onAuthorizeUrl,
  };
  switch (platform) {
    case "meta":
      return runMetaOAuthFlow(common);
    case "linkedin":
      return runLinkedInOAuthFlow({
        ...common,
        ...(args.enableWrites !== undefined ? { enableWrites: args.enableWrites } : {}),
      });
    case "google":
      return runGoogleOAuthFlow({
        ...common,
        ...(args.scopes ? { scopes: args.scopes } : {}),
      });
  }
}

async function openInBrowser(url: string): Promise<void> {
  // Best effort. We don't fail the wizard if the OS doesn't have a default
  // browser handler — the user can always copy the URL from the prompt.
  const { exec } = await import("node:child_process");
  const { platform } = await import("node:os");
  const cmd =
    platform() === "darwin"
      ? `open "${url}"`
      : platform() === "win32"
        ? `start "" "${url}"`
        : `xdg-open "${url}"`;
  exec(cmd, () => {
    /* swallow errors */
  });
}

interface PatchConfigInput {
  platform: Platform;
  label: string;
  clientId: string;
  /**
   * Keychain key for the durable secret:
   *   meta     -> access_token
   *   linkedin -> refresh_token
   *   google   -> credentials_json blob
   */
  keychainKey: string;
  extras: PlatformExtras;
  /**
   * Keychain key for LinkedIn's client_secret (refresh-time secret).
   * Present only when platform === 'linkedin'.
   */
  linkedinClientSecretKey?: string;
}

async function patchConfig(
  configPath: string,
  input: PatchConfigInput,
): Promise<void> {
  // Load existing config or create a fresh one.
  let config: AdsMcpConfig;
  if (existsSync(configPath)) {
    const raw = readFileSync(configPath, "utf8");
    const parsed = AdsMcpConfigSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      throw new Error(
        `Existing ${configPath} is not a valid ads-mcp config: ${parsed.error.message}`,
      );
    }
    config = parsed.data;
  } else {
    config = {
      version: 1,
      default_dry_run: true,
      log_level: "info",
      audit_log_path: "~/.ads-mcp/audit.log",
      platforms: {},
    };
  }

  const keychainRef = (key: string) => ({
    kind: "keychain" as const,
    service: KEYCHAIN_SERVICE,
    key,
  });

  switch (input.platform) {
    case "meta": {
      // Meta long-lived access token sits at keychainKey. Drop it into
      // token_ref directly — MetaClient reads token_ref via SecretsManager
      // and there's no programmatic refresh path.
      const acct = {
        label: input.label,
        mode: "read_write" as const,
        ad_account_id: input.extras.account.ad_account_id ?? "",
        ...(input.extras.account.business_id !== undefined
          ? { business_id: input.extras.account.business_id }
          : {}),
        token_ref: keychainRef(input.keychainKey),
      };
      const meta = config.platforms.meta ?? {
        enabled: true,
        default_account: input.label,
        accounts: [],
      };
      meta.enabled = true;
      meta.accounts = upsertByLabel(meta.accounts, acct);
      meta.default_account ??= input.label;
      config.platforms.meta = meta;
      break;
    }
    case "linkedin": {
      // LinkedIn TokenManager path: refresh_token + client_id + client_secret.
      // token_ref is required by the schema but unused at runtime when the
      // refresh fields are present; we point it at the refresh_token key as
      // a sensible default so the schema validator passes.
      if (!input.linkedinClientSecretKey) {
        throw new Error(
          "internal: linkedinClientSecretKey is required when platform is 'linkedin'",
        );
      }
      const refreshRef = keychainRef(input.keychainKey);
      const acct = {
        label: input.label,
        mode: "read_write" as const,
        ad_account_id: input.extras.account.ad_account_id ?? "",
        ...(input.extras.account.organization_id !== undefined
          ? { organization_id: input.extras.account.organization_id }
          : {}),
        token_ref: refreshRef,
        refresh_token_ref: refreshRef,
        client_id_ref: { kind: "inline" as const, value: input.clientId },
        client_secret_ref: keychainRef(input.linkedinClientSecretKey),
      };
      const linkedin = config.platforms.linkedin ?? {
        enabled: true,
        default_account: input.label,
        accounts: [],
      };
      linkedin.enabled = true;
      linkedin.accounts = upsertByLabel(linkedin.accounts, acct);
      linkedin.default_account ??= input.label;
      config.platforms.linkedin = linkedin;
      break;
    }
    case "google": {
      // Google credentials_json blob is at keychainKey. GoogleOAuth.ts reads
      // it via SecretsManager and JSON.parses to {type, client_id,
      // client_secret, refresh_token}. Same blob serves Ads / GA4 / GSC.
      const credsRef = keychainRef(input.keychainKey);
      const product = input.extras.account._google_product;
      if (product === "google_ads") {
        const developerToken = input.extras.account.developer_token;
        if (!developerToken) {
          throw new Error(
            "Google Ads requires a developer_token; rerun the wizard.",
          );
        }
        // Stash developer_token in keychain too — it's a long-lived secret.
        const devTokenKey = `google_ads:${input.label}:developer_token`;
        await KeychainStore.set(KEYCHAIN_SERVICE, devTokenKey, developerToken);
        const acct = {
          label: input.label,
          mode: "read_write" as const,
          customer_id: input.extras.account.customer_id ?? "",
          ...(input.extras.account.login_customer_id !== undefined
            ? { login_customer_id: input.extras.account.login_customer_id }
            : {}),
          developer_token_ref: keychainRef(devTokenKey),
          oauth_credentials_ref: credsRef,
        };
        const ga = config.platforms.google_ads ?? {
          enabled: true,
          default_account: input.label,
          accounts: [],
        };
        ga.enabled = true;
        ga.accounts = upsertByLabel(ga.accounts, acct);
        ga.default_account ??= input.label;
        config.platforms.google_ads = ga;
      } else if (product === "ga4") {
        const acct = {
          label: input.label,
          mode: "read_write" as const,
          property_id: input.extras.account.property_id ?? "",
          oauth_credentials_ref: credsRef,
        };
        const ga4 = config.platforms.ga4 ?? {
          enabled: true,
          default_account: input.label,
          accounts: [],
        };
        ga4.enabled = true;
        ga4.accounts = upsertByLabel(ga4.accounts, acct);
        ga4.default_account ??= input.label;
        config.platforms.ga4 = ga4;
      } else {
        const acct = {
          label: input.label,
          mode: "read_write" as const,
          site_url: input.extras.account.site_url ?? "",
          oauth_credentials_ref: credsRef,
        };
        const gsc = config.platforms.gsc ?? {
          enabled: true,
          default_account: input.label,
          accounts: [],
        };
        gsc.enabled = true;
        gsc.accounts = upsertByLabel(gsc.accounts, acct);
        gsc.default_account ??= input.label;
        config.platforms.gsc = gsc;
      }
      break;
    }
  }

  await mkdir(resolve(configPath, ".."), { recursive: true });
  await writeFile(configPath, JSON.stringify(config, null, 2));
  await chmod(configPath, 0o600);
}

function upsertByLabel<T extends { label: string }>(arr: T[], next: T): T[] {
  const idx = arr.findIndex((a) => a.label === next.label);
  if (idx === -1) return [...arr, next];
  const copy = [...arr];
  copy[idx] = next;
  return copy;
}

// Re-export the platform refresh helpers so the CLI doctor can use them too.
export {
  refreshGoogleAccessToken,
  refreshLinkedInAccessToken,
};
