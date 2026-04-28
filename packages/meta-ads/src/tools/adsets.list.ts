import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { z } from "zod";
import { MetaClient } from "../MetaClient.js";
import { baseInputShape, DatePreset } from "../schemas.js";

const Input = z.object({
  ...baseInputShape,
  campaign_id: z.string().min(1).describe("Meta campaign ID to list ad sets for."),
  date_preset: DatePreset,
  limit: z.number().int().positive().max(500).default(50),
});
type Input = z.infer<typeof Input>;

const ADSET_FIELDS = [
  "name",
  "status",
  "effective_status",
  "targeting",
  "daily_budget",
  "lifetime_budget",
  "bid_amount",
  "billing_event",
  "optimization_goal",
  "start_time",
  "end_time",
].join(",");

const INSIGHT_FIELDS = [
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
].join(",");

export const tool: ToolDefinition<Input, unknown> = {
  name: "meta.adsets.list",
  description: "List ad sets for a Meta campaign with targeting, budgets, and performance metrics.",
  platform: "meta",
  isWriteTool: false,
  inputSchema: Input,
  handler: async (input, ctx) => {
    const account = ctx.config.getAccount("meta", input.account);
    const client = new MetaClient(account, ctx.rateLimiter);
    const [adsets, insights] = await Promise.all([
      client.get(`/${input.campaign_id}/adsets`, { fields: ADSET_FIELDS, limit: input.limit }),
      client
        .get(`/${input.campaign_id}/insights`, {
          fields: INSIGHT_FIELDS,
          date_preset: input.date_preset,
          level: "adset",
          limit: input.limit,
        })
        .catch((err) => ({ data: [], error: (err as Error).message })),
    ]);
    return {
      adsets: (adsets as { data?: unknown[] }).data ?? [],
      insights: (insights as { data?: unknown[] }).data ?? [],
      meta_account_label: account.label,
    };
  },
};
