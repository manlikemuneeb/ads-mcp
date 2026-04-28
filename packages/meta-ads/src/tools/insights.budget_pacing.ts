import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { z } from "zod";
import { MetaClient } from "../MetaClient.js";
import { baseInputShape, DatePreset } from "../schemas.js";

const Input = z.object({
  ...baseInputShape,
  date_preset: DatePreset,
});
type Input = z.infer<typeof Input>;

const CAMPAIGN_FIELDS = [
  "name",
  "status",
  "effective_status",
  "daily_budget",
  "lifetime_budget",
  "budget_remaining",
  "spend_cap",
  "start_time",
  "stop_time",
].join(",");

const ADSET_FIELDS = [
  "name",
  "status",
  "effective_status",
  "campaign_id",
  "daily_budget",
  "lifetime_budget",
  "budget_remaining",
  "start_time",
  "end_time",
].join(",");

const ACTIVE_PAUSED_FILTER = JSON.stringify([
  { field: "effective_status", operator: "IN", value: ["ACTIVE", "PAUSED"] },
]);

export const tool: ToolDefinition<Input, unknown> = {
  name: "meta.insights.budget_pacing",
  description:
    "Budget pacing report: campaign and ad set budgets vs actual spend, budget remaining, and daily spend trend. Flags underspending or burn-rate risks.",
  platform: "meta",
  isWriteTool: false,
  inputSchema: Input,
  handler: async (input, ctx) => {
    const account = ctx.config.getAccount("meta", input.account);
    const client = new MetaClient(account, ctx.rateLimiter);
    const acctPath = client.getAccountPath();

    const [campaigns, spend, adsets, daily] = await Promise.all([
      client.get(`/${acctPath}/campaigns`, {
        fields: CAMPAIGN_FIELDS,
        filtering: ACTIVE_PAUSED_FILTER,
        limit: 50,
      }),
      client
        .get(`/${acctPath}/insights`, {
          fields: "campaign_id,campaign_name,spend,impressions,clicks",
          date_preset: input.date_preset,
          level: "campaign",
          limit: 50,
        })
        .catch((err) => ({ data: [], error: (err as Error).message })),
      client
        .get(`/${acctPath}/adsets`, {
          fields: ADSET_FIELDS,
          filtering: ACTIVE_PAUSED_FILTER,
          limit: 100,
        })
        .catch((err) => ({ data: [], error: (err as Error).message })),
      client
        .get(`/${acctPath}/insights`, {
          fields: "spend",
          date_preset: input.date_preset,
          time_increment: 1,
          limit: 90,
        })
        .catch((err) => ({ data: [], error: (err as Error).message })),
    ]);

    return {
      campaigns: (campaigns as { data?: unknown[] }).data ?? [],
      campaign_spend: (spend as { data?: unknown[] }).data ?? [],
      adsets: (adsets as { data?: unknown[] }).data ?? [],
      daily_spend: (daily as { data?: unknown[] }).data ?? [],
      meta_account_label: account.label,
    };
  },
};
