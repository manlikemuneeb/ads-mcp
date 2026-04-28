import { z } from "zod";

// --- Secret references ---------------------------------------------------------
// A SecretRef is a portable pointer to a secret value. Resolution happens at
// runtime via SecretsManager. Inline values are discouraged but supported for
// testing.

export const SecretRefSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("env"),
    var: z.string().min(1),
  }),
  z.object({
    kind: z.literal("file"),
    path: z.string().min(1),
  }),
  z.object({
    kind: z.literal("keychain"),
    service: z.string().default("ads-mcp"),
    key: z.string().min(1),
  }),
  z.object({
    kind: z.literal("inline"),
    value: z.string().min(1),
  }),
]);
export type SecretRef = z.infer<typeof SecretRefSchema>;

// --- Account base --------------------------------------------------------------
// Every platform account inherits these fields. Label is the user-facing
// identifier, mode gates writes, notes is free-form.

const AccountBase = z.object({
  label: z.string().min(1),
  mode: z.enum(["read", "read_write"]).default("read"),
  notes: z.string().optional(),
});
export type AccountMode = "read" | "read_write";

// --- Per-platform account schemas ----------------------------------------------

export const MetaAccountSchema = AccountBase.extend({
  ad_account_id: z.string().min(1),
  business_id: z.string().optional(),
  token_ref: SecretRefSchema,
  refresh_token_ref: SecretRefSchema.optional(),
  app_id_ref: SecretRefSchema.optional(),
  app_secret_ref: SecretRefSchema.optional(),
});
export type MetaAccount = z.infer<typeof MetaAccountSchema>;

export const LinkedInAccountSchema = AccountBase.extend({
  ad_account_id: z.string().min(1),
  organization_id: z.string().optional(),
  token_ref: SecretRefSchema,
  refresh_token_ref: SecretRefSchema.optional(),
  client_id_ref: SecretRefSchema.optional(),
  client_secret_ref: SecretRefSchema.optional(),
});
export type LinkedInAccount = z.infer<typeof LinkedInAccountSchema>;

export const GoogleAdsAccountSchema = AccountBase.extend({
  customer_id: z.string().min(1),
  login_customer_id: z.string().optional(),
  developer_token_ref: SecretRefSchema,
  oauth_credentials_ref: SecretRefSchema,
});
export type GoogleAdsAccount = z.infer<typeof GoogleAdsAccountSchema>;

export const Ga4PropertySchema = AccountBase.extend({
  property_id: z.string().min(1),
  oauth_credentials_ref: SecretRefSchema,
});
export type Ga4Property = z.infer<typeof Ga4PropertySchema>;

export const GscSiteSchema = AccountBase.extend({
  site_url: z.string().min(1),
  oauth_credentials_ref: SecretRefSchema,
});
export type GscSite = z.infer<typeof GscSiteSchema>;

// --- Platform config -----------------------------------------------------------

const platformConfigFor = <T extends z.ZodObject<z.ZodRawShape>>(accountSchema: T) =>
  z.object({
    enabled: z.boolean().default(false),
    default_account: z.string().min(1),
    accounts: z.array(accountSchema).min(1),
  });

export const PlatformsSchema = z.object({
  meta: platformConfigFor(MetaAccountSchema).optional(),
  linkedin: platformConfigFor(LinkedInAccountSchema).optional(),
  google_ads: platformConfigFor(GoogleAdsAccountSchema).optional(),
  ga4: platformConfigFor(Ga4PropertySchema).optional(),
  gsc: platformConfigFor(GscSiteSchema).optional(),
});
export type Platforms = z.infer<typeof PlatformsSchema>;

export type PlatformName = keyof Platforms;

// --- Top-level config ----------------------------------------------------------

export const AdsMcpConfigSchema = z.object({
  version: z.literal(1),
  default_dry_run: z.boolean().default(true),
  log_level: z.enum(["debug", "info", "warn", "error"]).default("info"),
  audit_log_path: z.string().default("~/.ads-mcp/audit.log"),
  platforms: PlatformsSchema,
});
export type AdsMcpConfig = z.infer<typeof AdsMcpConfigSchema>;

// --- Errors --------------------------------------------------------------------

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export class WriteDeniedError extends Error {
  constructor(
    message: string,
    public readonly reason: "dry_run_required" | "account_read_only" | "tool_not_writable",
  ) {
    super(message);
    this.name = "WriteDeniedError";
  }
}

export class SecretResolveError extends Error {
  constructor(
    message: string,
    public readonly ref: SecretRef,
  ) {
    super(message);
    this.name = "SecretResolveError";
  }
}

export class RateLimitedError extends Error {
  constructor(
    message: string,
    public readonly retryAfterMs: number,
    public readonly platform: PlatformName,
  ) {
    super(message);
    this.name = "RateLimitedError";
  }
}
