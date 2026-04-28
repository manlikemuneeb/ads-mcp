import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { z } from "zod";
import { META_INSIGHTS_PLACEMENTS } from "../fields.js";
import { MetaClient } from "../MetaClient.js";
import {
  baseInputShape,
  buildInsightsQuery,
  insightsCommonShape,
} from "../schemas.js";

const Input = z.object({
  ...baseInputShape,
  ...insightsCommonShape,
  campaign_id: z
    .string()
    .optional()
    .describe("Limit to a campaign. Omit for account-wide breakdown."),
  include_device: z
    .boolean()
    .default(false)
    .describe(
      "When true, also breaks down by device_platform (mobile/desktop) on top of placement.",
    ),
});
type Input = z.infer<typeof Input>;

// Sourced from packages/meta-ads/fixtures/fields-insights.json.
const FIELDS = META_INSIGHTS_PLACEMENTS;

export const tool: ToolDefinition<Input, unknown> = {
  name: "meta.insights.placements",
  description:
    "Break down Meta ad performance by placement (Facebook Feed, Instagram Stories, Reels, Audience Network). Supports custom date ranges, time buckets, filtering, attribution-window overrides, and optional device-platform breakdown.",
  platform: "meta",
  isWriteTool: false,
  inputSchema: Input,
  handler: async (input, ctx) => {
    const account = ctx.config.getAccount("meta", input.account);
    const client = new MetaClient(account, ctx.rateLimiter);
    const parent = input.campaign_id ?? client.getAccountPath();

    const breakdowns = input.include_device
      ? "publisher_platform,platform_position,device_platform"
      : "publisher_platform,platform_position";

    const query: Record<string, string | number | undefined> = {
      fields: FIELDS,
      breakdowns,
      ...buildInsightsQuery(input),
    };
    if (query.limit === undefined) query.limit = 100;

    const result = (await client.get(`/${parent}/insights`, query)) as {
      data?: unknown[];
      paging?: unknown;
    };
    return {
      scope: input.campaign_id ? `campaign:${input.campaign_id}` : "account",
      data: result.data ?? [],
      paging: result.paging ?? null,
      meta_account_label: account.label,
    };
  },
};
