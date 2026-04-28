import { z } from "zod";

export const AccountLabel = z.string().min(1).optional();

/** YYYY-MM-DD pair, comma-separated, e.g. "2026-04-01,2026-04-30" */
export const DateRangeString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}\s*,\s*\d{4}-\d{2}-\d{2}$/, "Expected 'YYYY-MM-DD, YYYY-MM-DD'");

export const Pivot = z
  .enum(["CAMPAIGN", "CREATIVE", "ACCOUNT", "MEMBER_COMPANY", "MEMBER_JOB_TITLE", "MEMBER_INDUSTRY"])
  .default("CAMPAIGN");

export const baseInputShape = {
  account: AccountLabel.describe("Account label from config. Omit for default."),
};

export const baseWriteInputShape = {
  ...baseInputShape,
  dry_run: z
    .boolean()
    .optional()
    .describe(
      "If true, validates and simulates without mutating. Defaults to config.default_dry_run.",
    ),
};

/** LinkedIn Money object, used for budgets. */
export const Money = z.object({
  amount: z.string().regex(/^\d+(\.\d+)?$/, "Decimal string like '100.00'"),
  currency_code: z.string().length(3).describe("ISO 4217 code, e.g. 'USD', 'CAD', 'EUR'"),
});
export type Money = z.infer<typeof Money>;
