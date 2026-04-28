import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { z } from "zod";
import { MetaClient } from "../MetaClient.js";
import { baseInputShape, DatePreset } from "../schemas.js";

const Input = z.object({
  ...baseInputShape,
  date_preset: DatePreset,
});
type Input = z.infer<typeof Input>;

const OVERVIEW_FIELDS = [
  "impressions",
  "clicks",
  "spend",
  "cpc",
  "cpm",
  "ctr",
  "reach",
  "frequency",
  "actions",
  "cost_per_action_type",
  "purchase_roas",
].join(",");

const ACCOUNT_FIELDS = ["name", "account_status", "currency", "timezone_name", "amount_spent"].join(",");

export const tool: ToolDefinition<Input, unknown> = {
  name: "meta.account.overview",
  description:
    "High-level Meta ad account overview: total spend, impressions, clicks, CTR, CPM, CPC, daily trend, and account info.",
  platform: "meta",
  isWriteTool: false,
  inputSchema: Input,
  handler: async (input, ctx) => {
    const account = ctx.config.getAccount("meta", input.account);
    const client = new MetaClient(account, ctx.rateLimiter);
    const acctPath = client.getAccountPath();

    const [overview, daily, accountInfo] = await Promise.all([
      client.get(`/${acctPath}/insights`, {
        fields: OVERVIEW_FIELDS,
        date_preset: input.date_preset,
      }),
      client
        .get(`/${acctPath}/insights`, {
          fields: OVERVIEW_FIELDS,
          date_preset: input.date_preset,
          time_increment: 1,
          limit: 90,
        })
        .catch((err) => ({ data: [], error: (err as Error).message })),
      client.get(`/${acctPath}`, { fields: ACCOUNT_FIELDS }).catch((err) => ({
        error: (err as Error).message,
      })),
    ]);

    return {
      account: accountInfo,
      overview: (overview as { data?: unknown[] }).data ?? [],
      daily: (daily as { data?: unknown[] }).data ?? [],
      meta_account_label: account.label,
    };
  },
};
