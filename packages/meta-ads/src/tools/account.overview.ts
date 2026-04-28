import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { z } from "zod";
import {
  META_ACCOUNT_INFO_FIELDS,
  META_INSIGHTS_ACCOUNT_OVERVIEW,
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
  trend_increment: z
    .union([z.enum(["1", "7", "28", "monthly"]), z.number().int().positive()])
    .default("1")
    .describe("Bucket size for the daily trend payload. Default 1 = daily."),
});
type Input = z.infer<typeof Input>;

// Sourced from packages/meta-ads/fixtures/fields-insights.json.
const OVERVIEW_FIELDS = META_INSIGHTS_ACCOUNT_OVERVIEW;
const ACCOUNT_FIELDS = META_ACCOUNT_INFO_FIELDS;

export const tool: ToolDefinition<Input, unknown> = {
  name: "meta.account.overview",
  description:
    "High-level Meta ad account overview: total spend, impressions, clicks, CTR, CPM, CPC, configurable trend, and account info. Supports custom date ranges, filtering, and attribution-window overrides.",
  platform: "meta",
  isWriteTool: false,
  inputSchema: Input,
  handler: async (input, ctx) => {
    const account = ctx.config.getAccount("meta", input.account);
    const client = new MetaClient(account, ctx.rateLimiter);
    const acctPath = client.getAccountPath();

    const insightsBase = buildInsightsQuery(input);
    // Roll-up should not bucket; trend uses its own time_increment.
    const rollupQuery = { ...insightsBase };
    delete rollupQuery.time_increment;

    const [overview, daily, accountInfo] = await Promise.all([
      client.get(`/${acctPath}/insights`, {
        fields: OVERVIEW_FIELDS,
        ...rollupQuery,
      }),
      client
        .get(`/${acctPath}/insights`, {
          fields: OVERVIEW_FIELDS,
          time_increment: String(input.trend_increment),
          ...rollupQuery,
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
