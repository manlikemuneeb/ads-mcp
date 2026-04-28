import { z } from "zod";

/** Time presets accepted by Meta Insights API. */
export const DatePreset = z
  .enum([
    "today",
    "yesterday",
    "this_month",
    "last_month",
    "last_7d",
    "last_14d",
    "last_28d",
    "last_30d",
    "last_90d",
    "this_year",
    "last_year",
  ])
  .default("last_30d");

/** Optional account label, defaults to platform default_account. */
export const AccountLabel = z.string().min(1).optional();

/** Standard preamble used by every tool. */
export const baseInputShape = {
  account: AccountLabel.describe("Account label from config. Omit for default."),
};

/** Standard preamble for write tools. */
export const baseWriteInputShape = {
  ...baseInputShape,
  dry_run: z
    .boolean()
    .optional()
    .describe(
      "If true, validates and simulates the call without mutating. Defaults to config.default_dry_run (true on first install).",
    ),
};
