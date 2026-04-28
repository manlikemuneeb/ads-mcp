import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { z } from "zod";
import { GoogleAdsClient } from "../GoogleAdsClient.js";
import { baseInputShape } from "../schemas.js";

const Input = z.object({
  ...baseInputShape,
  query: z
    .string()
    .min(1)
    .describe(
      "GAQL query, e.g. 'SELECT campaign.id, campaign.name, metrics.impressions FROM campaign WHERE segments.date DURING LAST_30_DAYS'.",
    ),
  page_token: z.string().optional().describe("Continuation token from a previous page response."),
});
type Input = z.infer<typeof Input>;

export const tool: ToolDefinition<Input, unknown> = {
  name: "google_ads.query",
  description:
    "Run a GAQL query against Google Ads. Returns the raw response envelope (results, fieldMask, nextPageToken). Use this for any read; the GAQL reference is at developers.google.com/google-ads/api/docs/query/overview.",
  platform: "google_ads",
  isWriteTool: false,
  inputSchema: Input,
  handler: async (input, ctx) => {
    const account = ctx.config.getAccount("google_ads", input.account);
    const client = new GoogleAdsClient(account, ctx.rateLimiter);
    const result = await client.search(input.query, input.page_token);
    return {
      ...(result as Record<string, unknown>),
      google_ads_account_label: account.label,
    };
  },
};
