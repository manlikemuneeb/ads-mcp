import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { z } from "zod";
import { META_ADSET_FIELDS, META_INSIGHTS_ADSETS_LIST } from "../fields.js";
import { MetaClient } from "../MetaClient.js";
import { baseInputShape, DatePreset } from "../schemas.js";

const Input = z.object({
  ...baseInputShape,
  campaign_id: z.string().min(1).describe("Meta campaign ID to list ad sets for."),
  date_preset: DatePreset,
  limit: z.number().int().positive().max(500).default(50),
  status_filter: z
    .array(z.enum(["ACTIVE", "PAUSED", "DELETED", "ARCHIVED"]))
    .optional()
    .describe("Filter to ad sets whose effective_status is in this list."),
  after: z
    .string()
    .optional()
    .describe("Pagination cursor from a previous response's paging.cursors.after."),
  name_search: z
    .string()
    .optional()
    .describe("Substring search on ad-set name (Meta does case-insensitive match)."),
});
type Input = z.infer<typeof Input>;

// Sourced from packages/meta-ads/fixtures/fields-insights.json.
const ADSET_FIELDS = META_ADSET_FIELDS;
const INSIGHT_FIELDS = META_INSIGHTS_ADSETS_LIST;

export const tool: ToolDefinition<Input, unknown> = {
  name: "meta.adsets.list",
  description: "List ad sets for a Meta campaign with targeting, budgets, and performance metrics.",
  platform: "meta",
  isWriteTool: false,
  inputSchema: Input,
  handler: async (input, ctx) => {
    const account = ctx.config.getAccount("meta", input.account);
    const client = new MetaClient(account, ctx.rateLimiter);

    const adsetQuery: Record<string, string | number | undefined> = {
      fields: ADSET_FIELDS,
      limit: input.limit,
    };
    const filters: Array<{ field: string; operator: string; value: unknown }> = [];
    if (input.status_filter && input.status_filter.length > 0) {
      filters.push({
        field: "effective_status",
        operator: "IN",
        value: input.status_filter,
      });
    }
    if (input.name_search) {
      filters.push({ field: "name", operator: "CONTAIN", value: input.name_search });
    }
    if (filters.length > 0) adsetQuery.filtering = JSON.stringify(filters);
    if (input.after) adsetQuery.after = input.after;

    const [adsets, insights] = await Promise.all([
      client.get(`/${input.campaign_id}/adsets`, adsetQuery),
      client
        .get(`/${input.campaign_id}/insights`, {
          fields: INSIGHT_FIELDS,
          date_preset: input.date_preset,
          level: "adset",
          limit: input.limit,
        })
        .catch((err) => ({ data: [], error: (err as Error).message })),
    ]);
    const adsetResp = adsets as {
      data?: unknown[];
      paging?: { cursors?: { after?: string } };
    };
    return {
      adsets: adsetResp.data ?? [],
      next_cursor: adsetResp.paging?.cursors?.after ?? null,
      insights: (insights as { data?: unknown[] }).data ?? [],
      meta_account_label: account.label,
    };
  },
};
