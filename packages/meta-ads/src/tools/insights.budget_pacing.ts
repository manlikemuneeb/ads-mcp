import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { z } from "zod";
import {
  META_ADSET_PACING_FIELDS,
  META_CAMPAIGN_PACING_FIELDS,
} from "../fields.js";
import { MetaClient } from "../MetaClient.js";
import {
  baseInputShape,
  buildInsightsQuery,
  insightsCommonShape,
} from "../schemas.js";

const Input = z.object({
  ...baseInputShape,
  ...insightsCommonShape,
  status_filter: z
    .array(z.enum(["ACTIVE", "PAUSED", "DELETED", "ARCHIVED"]))
    .default(["ACTIVE", "PAUSED"])
    .describe(
      "Effective-status set to include in the pacing report. Defaults to active + paused so deleted/archived entities are excluded.",
    ),
  trend_increment: z
    .union([z.enum(["1", "7", "28", "monthly"]), z.number().int().positive()])
    .default("1")
    .describe("Bucket size for daily_spend. Default 1 = daily."),
});
type Input = z.infer<typeof Input>;

// Sourced from packages/meta-ads/fixtures/fields-insights.json.
const CAMPAIGN_FIELDS = META_CAMPAIGN_PACING_FIELDS;
const ADSET_FIELDS = META_ADSET_PACING_FIELDS;

export const tool: ToolDefinition<Input, unknown> = {
  name: "meta.insights.budget_pacing",
  description:
    "Budget pacing report: campaign and ad set budgets vs actual spend, budget remaining, and a configurable trend. Flags underspending or burn-rate risks. Supports custom date ranges, status filtering, and the full insights filter/attribution surface.",
  platform: "meta",
  isWriteTool: false,
  inputSchema: Input,
  handler: async (input, ctx) => {
    const account = ctx.config.getAccount("meta", input.account);
    const client = new MetaClient(account, ctx.rateLimiter);
    const acctPath = client.getAccountPath();

    const statusFilter = JSON.stringify([
      { field: "effective_status", operator: "IN", value: input.status_filter },
    ]);

    const insightsBase = buildInsightsQuery(input);
    delete insightsBase.time_increment;

    const [campaigns, spend, adsets, daily] = await Promise.all([
      client.get(`/${acctPath}/campaigns`, {
        fields: CAMPAIGN_FIELDS,
        filtering: statusFilter,
        limit: input.limit ?? 50,
      }),
      client
        .get(`/${acctPath}/insights`, {
          fields: "campaign_id,campaign_name,spend,impressions,clicks",
          level: "campaign",
          ...insightsBase,
          limit: input.limit ?? 50,
        })
        .catch((err) => ({ data: [], error: (err as Error).message })),
      client
        .get(`/${acctPath}/adsets`, {
          fields: ADSET_FIELDS,
          filtering: statusFilter,
          limit: 100,
        })
        .catch((err) => ({ data: [], error: (err as Error).message })),
      client
        .get(`/${acctPath}/insights`, {
          fields: "spend",
          time_increment: String(input.trend_increment),
          ...insightsBase,
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
