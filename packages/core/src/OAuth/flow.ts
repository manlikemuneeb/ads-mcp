import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { generatePkcePair, generateState } from "./pkce.js";
import type {
  OAuthClientCredentials,
  OAuthFlowInput,
  OAuthProvider,
  OAuthTokens,
} from "./types.js";

/**
 * Runs an OAuth 2.0 authorization-code flow with PKCE (when the provider
 * supports it) and a loopback redirect URI.
 *
 * Steps:
 *   1. Spin up a tiny HTTP server on 127.0.0.1:<port>.
 *   2. Build authorize URL with state + (optionally) PKCE challenge.
 *   3. Hand the URL to the caller (CLI) which opens it in the user's browser.
 *   4. User signs in and approves; provider redirects to our local server
 *      with `?code=...&state=...`.
 *   5. We verify state, exchange code for tokens at the provider's token
 *      endpoint, and return the result.
 *
 * Errors:
 *   - timeout (default 5 minutes) → throws OAuthTimeoutError
 *   - state mismatch → throws OAuthStateMismatchError
 *   - provider error (?error=access_denied&...) → throws OAuthProviderError
 *   - non-2xx token exchange → throws OAuthTokenExchangeError
 *
 * Test seam: pass a `_fetch` override (and start the server elsewhere if you
 * want full isolation). Production code uses globalThis.fetch.
 */
export async function runOAuthFlow(
  input: OAuthFlowInput,
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response> = (
    globalThis.fetch as typeof fetch
  ).bind(globalThis),
): Promise<OAuthTokens> {
  const {
    provider,
    credentials,
    redirectUri,
    localPort,
    callbackPath = "/",
    onAuthorizeUrl,
    timeoutMs = 5 * 60_000,
  } = input;

  const state = generateState();
  const pkce = provider.usePkce ? generatePkcePair() : null;

  // Start the loopback server first so we know the bound port before
  // building the authorize URL (when localPort is undefined).
  const { server, port } = await startLoopbackServer(localPort ?? 0);

  // Replace any literal "{PORT}" placeholder in redirectUri with the bound
  // port, so callers can pass "http://127.0.0.1:{PORT}/" when they don't
  // know the port yet.
  const finalRedirectUri = redirectUri.replace("{PORT}", String(port));

  const authorizeInputs: AuthorizeUrlInputs = {
    provider,
    clientId: credentials.client_id,
    redirectUri: finalRedirectUri,
    state,
  };
  if (pkce) authorizeInputs.pkceChallenge = pkce.challenge;
  const authorizeUrl = buildAuthorizeUrl(authorizeInputs);

  if (onAuthorizeUrl) {
    await onAuthorizeUrl(authorizeUrl);
  } else {
    // Default: print to stderr so stdout stays clean for tools that capture it.
    process.stderr.write(
      `\n[ads-mcp] Open this URL in your browser to authorize:\n  ${authorizeUrl}\n\n`,
    );
  }

  let timer: NodeJS.Timeout | undefined;
  try {
    const callback = await waitForCallback({
      server,
      callbackPath,
      timeoutMs,
      onTimer: (t) => {
        timer = t;
      },
    });
    if (callback.error) {
      throw new OAuthProviderError(
        `Provider returned error: ${callback.error}${callback.errorDescription ? ` — ${callback.errorDescription}` : ""}`,
      );
    }
    if (!callback.code) {
      throw new OAuthProviderError(
        "Provider redirect missing 'code' query parameter",
      );
    }
    if (callback.state !== state) {
      throw new OAuthStateMismatchError(
        "OAuth state mismatch — possible CSRF or stale browser tab",
      );
    }

    const exchangeInputs: ExchangeInputs = {
      provider,
      credentials,
      code: callback.code,
      redirectUri: finalRedirectUri,
      fetchImpl,
    };
    if (pkce) exchangeInputs.pkceVerifier = pkce.verifier;
    return await exchangeCodeForTokens(exchangeInputs);
  } finally {
    if (timer) clearTimeout(timer);
    server.close();
  }
}

interface AuthorizeUrlInputs {
  provider: OAuthProvider;
  clientId: string;
  redirectUri: string;
  state: string;
  pkceChallenge?: string;
}

export function buildAuthorizeUrl(inputs: AuthorizeUrlInputs): string {
  const { provider, clientId, redirectUri, state, pkceChallenge } = inputs;
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    scope: provider.scopes.join(" "),
  });
  if (provider.usePkce && pkceChallenge) {
    params.set("code_challenge", pkceChallenge);
    params.set("code_challenge_method", "S256");
  }
  if (provider.extraAuthorizeParams) {
    for (const [k, v] of Object.entries(provider.extraAuthorizeParams)) {
      params.set(k, v);
    }
  }
  return `${provider.authorizeUrl}?${params.toString()}`;
}

interface ExchangeInputs {
  provider: OAuthProvider;
  credentials: OAuthClientCredentials;
  code: string;
  redirectUri: string;
  pkceVerifier?: string;
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response>;
}

async function exchangeCodeForTokens(
  inputs: ExchangeInputs,
): Promise<OAuthTokens> {
  const { provider, credentials, code, redirectUri, pkceVerifier, fetchImpl } =
    inputs;
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: credentials.client_id,
  });
  if (credentials.client_secret) {
    body.set("client_secret", credentials.client_secret);
  }
  if (provider.usePkce && pkceVerifier) {
    body.set("code_verifier", pkceVerifier);
  }

  const res = await fetchImpl(provider.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new OAuthTokenExchangeError(
      `Token exchange failed (${res.status}): ${text.slice(0, 400)}`,
    );
  }
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new OAuthTokenExchangeError(
      `Token endpoint returned non-JSON: ${(err as Error).message}; body: ${text.slice(0, 200)}`,
    );
  }
  const access = parsed.access_token;
  if (typeof access !== "string" || access === "") {
    throw new OAuthTokenExchangeError(
      `Token endpoint response missing access_token: ${text.slice(0, 200)}`,
    );
  }
  const result: OAuthTokens = { access_token: access };
  if (typeof parsed.refresh_token === "string") {
    result.refresh_token = parsed.refresh_token;
  }
  if (typeof parsed.expires_in === "number") {
    result.expires_at = Date.now() + parsed.expires_in * 1000;
  }
  if (typeof parsed.scope === "string") result.scope = parsed.scope;
  if (typeof parsed.token_type === "string") result.token_type = parsed.token_type;
  return result;
}

async function startLoopbackServer(
  requestedPort: number,
): Promise<{ server: Server; port: number }> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(requestedPort, "127.0.0.1", () => {
      const addr = server.address() as AddressInfo;
      resolve({ server, port: addr.port });
    });
  });
}

interface CallbackPayload {
  code?: string;
  state?: string;
  error?: string;
  errorDescription?: string;
}

interface WaitForCallbackInputs {
  server: Server;
  callbackPath: string;
  timeoutMs: number;
  onTimer: (t: NodeJS.Timeout) => void;
}

async function waitForCallback(
  inputs: WaitForCallbackInputs,
): Promise<CallbackPayload> {
  const { server, callbackPath, timeoutMs, onTimer } = inputs;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new OAuthTimeoutError(
          `OAuth flow timed out after ${timeoutMs}ms — did the browser ever hit the callback?`,
        ),
      );
    }, timeoutMs);
    onTimer(timer);

    server.on("request", (req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (url.pathname !== callbackPath) {
        // Ignore any other path (e.g. /favicon.ico).
        res.statusCode = 404;
        res.end("Not Found");
        return;
      }
      const code = url.searchParams.get("code") ?? undefined;
      const state = url.searchParams.get("state") ?? undefined;
      const error = url.searchParams.get("error") ?? undefined;
      const errorDescription =
        url.searchParams.get("error_description") ?? undefined;

      // Send the user a friendly success page so they know they can close
      // the tab. Keep it inline (no external assets) since the redirect
      // tab is sandboxed.
      const body = error
        ? `<!doctype html><meta charset="utf-8"><title>ads-mcp authorization error</title>
           <body style="font-family:system-ui;max-width:36rem;margin:4rem auto;padding:0 1rem">
           <h1>Authorization failed</h1>
           <p>${escapeHtml(error)}${errorDescription ? `: ${escapeHtml(errorDescription)}` : ""}</p>
           <p>You can close this tab and re-run the wizard.</p>
           </body>`
        : `<!doctype html><meta charset="utf-8"><title>ads-mcp authorized</title>
           <body style="font-family:system-ui;max-width:36rem;margin:4rem auto;padding:0 1rem">
           <h1>You're authorized.</h1>
           <p>You can close this tab and return to your terminal.</p>
           </body>`;
      res.statusCode = error ? 400 : 200;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(body);

      const payload: CallbackPayload = {};
      if (code !== undefined) payload.code = code;
      if (state !== undefined) payload.state = state;
      if (error !== undefined) payload.error = error;
      if (errorDescription !== undefined) payload.errorDescription = errorDescription;
      resolve(payload);
    });
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// --- Errors -----------------------------------------------------------------

export class OAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OAuthError";
  }
}
export class OAuthTimeoutError extends OAuthError {
  constructor(message: string) {
    super(message);
    this.name = "OAuthTimeoutError";
  }
}
export class OAuthStateMismatchError extends OAuthError {
  constructor(message: string) {
    super(message);
    this.name = "OAuthStateMismatchError";
  }
}
export class OAuthProviderError extends OAuthError {
  constructor(message: string) {
    super(message);
    this.name = "OAuthProviderError";
  }
}
export class OAuthTokenExchangeError extends OAuthError {
  constructor(message: string) {
    super(message);
    this.name = "OAuthTokenExchangeError";
  }
}
