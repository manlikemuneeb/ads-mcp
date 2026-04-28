import { z } from "zod";

export const AccountLabel = z.string().min(1).optional();

export const baseInputShape = {
  account: AccountLabel.describe("Account label from config. Omit for default."),
};

export const baseWriteInputShape = {
  ...baseInputShape,
  dry_run: z
    .boolean()
    .optional()
    .describe("If true, validates and simulates without mutating. Defaults to config.default_dry_run."),
};
