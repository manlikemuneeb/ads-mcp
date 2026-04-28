import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { z } from "zod";
import { GoogleAdsClient } from "../GoogleAdsClient.js";
import { baseInputShape } from "../schemas.js";

const Input = z.object({
  ...baseInputShape,
  campaign_id: z
    .string()
    .optional()
    .describe(
      "Filter ad groups to a specific campaign ID. Omit for all ad groups under the account.",
    ),
  date_range: z
    .enum([
      "TODAY",
      "YESTERDAY",
      "LAST_7_DAYS",
      "LAST_14_DAYS",
      "LAST_30_DAYS",
      "LAST_90_DAYS",
      "THIS_MONTH",
      "LAST_MONTH",
      "THIS_QUARTER",
      "LAST_QUARTER",
      "THIS_YEAR",
      "LAST_YEAR",
    ])
    .default("LAST_30_DAYS"),
  limit: z.number().int().positive().max(1000).default(100),
});
type Input = z.infer<typeof Input>;

const QUERY = (campaignId: string | undefined, dateRange: string, limit: number) => {
  const where = [`segments.date DURING ${dateRange}`];
  if (campaignId) where.push(`campaign.id = ${campaignId}`);
  return `
SELECT
  ad_group.id,
  ad_group.name,
  ad_group.status,
  ad_group.type,
  ad_group.cpc_bid_micros,
  campaign.id,
  campaign.name,
  metrics.impressions,
  metrics.clicks,
  metrics.cost_micros,
  metrics.conversions,
  metrics.conversions_value
FROM ad_group
WHERE ${where.join(" AND ")}
ORDER BY metrics.impressions DESC
LIMIT ${limit}
`.trim();
};

export const tool: ToolDefinition<Input, unknown> = {
  name: "google_ads.ad_groups.list",
  description:
    "List Google Ads ad groups with bid, status, parent campaign, and core metrics over a date range. Optional filter to a single campaign. Convenience wrapper over GAQL.",
  platform: "google_ads",
  isWriteTool: false,
  inputSchema: Input,
  handler: async (input, ctx) => {
    const account = ctx.config.getAccount("google_ads", input.account);
    const client = new GoogleAdsClient(account, ctx.rateLimiter);
    const result = (await client.search(
      QUERY(input.campaign_id, input.date_range, input.limit),
    )) as {
      results?: unknown[];
      fieldMask?: string;
      nextPageToken?: string;
    };
    return {
      ad_groups: result.results ?? [],
      field_mask: result.fieldMask ?? null,
      next_page_token: result.nextPageToken ?? null,
      ...(input.campaign_id ? { campaign_id: input.campaign_id } : {}),
      google_ads_account_label: account.label,
    };
  },
};
