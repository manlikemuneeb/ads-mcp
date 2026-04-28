import { z } from "zod";

export const AccountLabel = z.string().min(1).optional();
export const baseInputShape = { account: AccountLabel };
export const baseWriteInputShape = {
  ...baseInputShape,
  dry_run: z.boolean().optional(),
};
