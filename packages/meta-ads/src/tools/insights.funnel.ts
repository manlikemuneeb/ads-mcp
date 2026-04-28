import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { z } from "zod";
import { META_INSIGHTS_FUNNEL } from "../fields.js";
import { MetaClient } from "../MetaClient.js";
import {
  baseInputShape,
  buildInsightsQuery,
  insightsCommonShape,
} from "../schemas.js";

const Input = z.object({
  ...baseInputShape,
  ...insightsCommonShape,
  campaign_id: z.string().optional(),
  trend_increment: z
    .union([z.enum(["1", "7", "28", "monthly"]), z.number().int().positive()])
    .default("1")
    .describe(
      "Bucket size for the daily_trend payload. Defaults to 1 (daily). The roll-up `funnel` block always uses your time_range/date_preset whole-window aggregation.",
    ),
});
type Input = z.infer<typeof Input>;

// Sourced from packages/meta-ads/fixtures/fields-insights.json.
const FUNNEL_FIELDS = META_INSIGHTS_FUNNEL;

export const tool: ToolDefinition<Input, unknown> = {
  name: "meta.insights.funnel",
  description:
    "Conversion funnel analysis: impressions → clicks → outbound clicks → actions, with quality/engagement/conversion rankings and a configurable trend. Supports custom date ranges, filtering, and attribution overrides.",
  platform: "meta",
  isWriteTool: false,
  inputSchema: Input,
  handler: async (input, ctx) => {
    const account = ctx.config.getAccount("meta", input.account);
    const client = new MetaClient(account, ctx.rateLimiter);
    const parent = input.campaign_id ?? client.getAccountPath();

    const sharedQuery = buildInsightsQuery(input);
    // The funnel roll-up should not bucket by time even if the caller set
    // time_increment, so strip it from the roll-up query.
    const rollupQuery = { ...sharedQuery };
    delete rollupQuery.time_increment;

    const [funnel, daily] = await Promise.all([
      client.get(`/${parent}/insights`, {
        fields: FUNNEL_FIELDS,
        ...rollupQuery,
      }),
      client
        .get(`/${parent}/insights`, {
          fields: "impressions,clicks,spend,outbound_clicks,actions",
          time_increment: String(input.trend_increment),
          ...rollupQuery, // share filtering / attribution
          limit: 90,
        })
        .catch((err) => ({ data: [], error: (err as Error).message })),
    ]);

    return {
      funnel: (funnel as { data?: unknown[] }).data ?? [],
      daily_trend: (daily as { data?: unknown[] }).data ?? [],
      scope: input.campaign_id ? `campaign:${input.campaign_id}` : "account",
      meta_account_label: account.label,
    };
  },
};
