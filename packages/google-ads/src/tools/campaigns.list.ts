import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { z } from "zod";
import { GoogleAdsClient } from "../GoogleAdsClient.js";
import { baseInputShape } from "../schemas.js";

const Input = z.object({
  ...baseInputShape,
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

const QUERY = (dateRange: string, limit: number) => `
SELECT
  campaign.id,
  campaign.name,
  campaign.status,
  campaign.advertising_channel_type,
  campaign.start_date,
  campaign.end_date,
  campaign_budget.id,
  campaign_budget.amount_micros,
  metrics.impressions,
  metrics.clicks,
  metrics.cost_micros,
  metrics.conversions,
  metrics.conversions_value
FROM campaign
WHERE segments.date DURING ${dateRange}
ORDER BY metrics.impressions DESC
LIMIT ${limit}
`.trim();

export const tool: ToolDefinition<Input, unknown> = {
  name: "google_ads.campaigns.list",
  description:
    "List Google Ads campaigns over a date range with budgets and core metrics. Convenience wrapper over GAQL; for custom shapes use google_ads.query.",
  platform: "google_ads",
  isWriteTool: false,
  inputSchema: Input,
  handler: async (input, ctx) => {
    const account = ctx.config.getAccount("google_ads", input.account);
    const client = new GoogleAdsClient(account, ctx.rateLimiter);
    const result = (await client.search(QUERY(input.date_range, input.limit))) as {
      results?: unknown[];
      fieldMask?: string;
      nextPageToken?: string;
    };
    return {
      campaigns: result.results ?? [],
      field_mask: result.fieldMask ?? null,
      next_page_token: result.nextPageToken ?? null,
      google_ads_account_label: account.label,
    };
  },
};
