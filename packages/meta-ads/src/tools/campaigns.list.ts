import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { z } from "zod";
import {
  META_CAMPAIGN_FIELDS,
  META_INSIGHTS_CAMPAIGNS_LIST,
} from "../fields.js";
import { MetaClient } from "../MetaClient.js";
import { baseInputShape, DatePreset } from "../schemas.js";

const Input = z.object({
  ...baseInputShape,
  date_preset: DatePreset,
  limit: z.number().int().positive().max(500).default(25),
  status_filter: z
    .array(z.enum(["ACTIVE", "PAUSED", "DELETED", "ARCHIVED"]))
    .optional()
    .describe("Filter to campaigns whose effective_status is in this list."),
});
type Input = z.infer<typeof Input>;

// Sourced from packages/meta-ads/fixtures/fields-insights.json.
const CAMPAIGN_FIELDS = META_CAMPAIGN_FIELDS;
const INSIGHT_FIELDS = META_INSIGHTS_CAMPAIGNS_LIST;

export const tool: ToolDefinition<Input, unknown> = {
  name: "meta.campaigns.list",
  description:
    "List Meta ad campaigns with status, budgets, and performance metrics. Supports status filter and pagination.",
  platform: "meta",
  isWriteTool: false,
  inputSchema: Input,
  handler: async (input, ctx) => {
    const account = ctx.config.getAccount("meta", input.account);
    const client = new MetaClient(account, ctx.rateLimiter);
    const acctPath = client.getAccountPath();

    const campaignQuery: Record<string, string | number> = {
      fields: CAMPAIGN_FIELDS,
      limit: input.limit,
    };
    if (input.status_filter && input.status_filter.length > 0) {
      campaignQuery.filtering = JSON.stringify([
        { field: "effective_status", operator: "IN", value: input.status_filter },
      ]);
    }

    const [campaigns, insights] = await Promise.all([
      client.get(`/${acctPath}/campaigns`, campaignQuery),
      client
        .get(`/${acctPath}/insights`, {
          fields: INSIGHT_FIELDS,
          date_preset: input.date_preset,
          level: "campaign",
          limit: input.limit,
        })
        .catch((err) => ({ data: [], error: (err as Error).message })),
    ]);

    return {
      campaigns: (campaigns as { data?: unknown[] }).data ?? [],
      insights: (insights as { data?: unknown[] }).data ?? [],
      paging: (campaigns as { paging?: unknown }).paging ?? null,
      meta_account_label: account.label,
    };
  },
};
