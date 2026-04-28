import { z } from "zod";

export const AccountLabel = z.string().min(1).optional();

export const baseInputShape = {
  account: AccountLabel.describe("Property label from config. Omit for default."),
};

export const baseWriteInputShape = {
  ...baseInputShape,
  dry_run: z.boolean().optional(),
};
