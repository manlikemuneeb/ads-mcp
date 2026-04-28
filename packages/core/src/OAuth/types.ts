/**
 * Provider-agnostic OAuth 2.0 types.
 *
 * Each platform (Meta, LinkedIn, Google) supplies an OAuthProvider config
 * describing its authorize/token endpoints and required scopes; the core
 * runOAuthFlow function in flow.ts consumes that config.
 */

export interface OAuthProvider {
  /**
   * Stable identifier used in audit logs and keychain keys (e.g. "linkedin",
   * "meta", "google"). Lowercase, no spaces.
   */
  name: string;
  /** Authorize endpoint that the user gets redirected to in their browser. */
  authorizeUrl: string;
  /** Token endpoint that the code is exchanged at server-side. */
  tokenUrl: string;
  /** Scopes the wizard should request. */
  scopes: string[];
  /**
   * Whether this provider supports PKCE (RFC 7636). Google does, LinkedIn
   * does, Meta does not — Meta uses client_secret only.
   */
  usePkce: boolean;
  /**
   * Whether this provider issues refresh tokens. Meta does not; tokens are
   * "long-lived" but must be manually re-acquired before expiry.
   */
  issuesRefreshToken: boolean;
  /**
   * Optional extra parameters to include on the authorize request (e.g.
   * Google's `access_type=offline&prompt=consent` to force a refresh token).
   */
  extraAuthorizeParams?: Record<string, string>;
}

export interface OAuthClientCredentials {
  client_id: string;
  /**
   * Optional for public clients (PKCE-only providers can omit this), but
   * Meta and LinkedIn require it on token exchange.
   */
  client_secret?: string;
}

export interface OAuthTokens {
  access_token: string;
  /**
   * Some providers issue an offline refresh token; some don't (Meta).
   * Callers should treat this field as optional.
   */
  refresh_token?: string;
  /** Unix epoch milliseconds; absolute, not relative. */
  expires_at?: number;
  /** Original scope string from the provider response. */
  scope?: string;
  /** Bearer / etc. */
  token_type?: string;
}

/**
 * Inputs to runOAuthFlow.
 */
export interface OAuthFlowInput {
  provider: OAuthProvider;
  credentials: OAuthClientCredentials;
  /**
   * The redirect URI that the user has registered with the provider.
   * Must point at http://127.0.0.1:<port>/<path> where port matches
   * `localPort` (or any port if `localPort` is undefined and provider
   * supports loopback wildcards — Google does).
   */
  redirectUri: string;
  /**
   * Local TCP port the wizard listens on for the OAuth callback.
   * If omitted, the OS assigns a free port.
   */
  localPort?: number;
  /**
   * Optional override of the path the local server listens on. Default "/".
   */
  callbackPath?: string;
  /**
   * Hook fired with the authorize URL so the caller (CLI) can open the
   * browser. Defaults to logging the URL to stderr.
   */
  onAuthorizeUrl?: (url: string) => Promise<void> | void;
  /**
   * Total flow timeout in milliseconds. Default 5 minutes.
   */
  timeoutMs?: number;
}
