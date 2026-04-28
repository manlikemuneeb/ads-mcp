import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { z } from "zod";
import {
  META_AD_CREATIVE_EXPANSION,
  META_INSIGHTS_CREATIVE,
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
  campaign_id: z.string().optional(),
});
type Input = z.infer<typeof Input>;

// Sourced from packages/meta-ads/fixtures/fields-insights.json.
const AD_FIELDS = META_AD_CREATIVE_EXPANSION;
const INSIGHT_FIELDS = META_INSIGHTS_CREATIVE;

export const tool: ToolDefinition<Input, unknown> = {
  name: "meta.insights.creative",
  description:
    "Compare performance across individual ad creatives (images, videos, copy) with creative details inline. Supports custom date ranges, time-bucket grouping, filtering, and attribution overrides.",
  platform: "meta",
  isWriteTool: false,
  inputSchema: Input,
  handler: async (input, ctx) => {
    const account = ctx.config.getAccount("meta", input.account);
    const client = new MetaClient(account, ctx.rateLimiter);
    const parent = input.campaign_id ?? client.getAccountPath();
    const adsPath = input.campaign_id
      ? `/${input.campaign_id}/ads`
      : `/${client.getAccountPath()}/ads`;

    const insightsQuery: Record<string, string | number | undefined> = {
      fields: INSIGHT_FIELDS,
      level: input.level ?? "ad",
      ...buildInsightsQuery(input),
    };
    if (insightsQuery.limit === undefined) insightsQuery.limit = 50;

    const [ads, insights] = await Promise.all([
      client.get(adsPath, {
        fields: AD_FIELDS,
        limit: input.limit ?? 50,
      }),
      client
        .get(`/${parent}/insights`, insightsQuery)
        .catch((err) => ({ data: [], error: (err as Error).message })),
    ]);
    const adData = (ads as { data?: unknown[] }).data ?? [];
    return {
      ads: adData,
      insights: (insights as { data?: unknown[] }).data ?? [],
      total_ads: adData.length,
      meta_account_label: account.label,
    };
  },
};
