import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { z } from "zod";
import { META_AD_FIELDS, META_INSIGHTS_ADS_LIST } from "../fields.js";
import { MetaClient } from "../MetaClient.js";
import { baseInputShape, DatePreset } from "../schemas.js";

const Input = z.object({
  ...baseInputShape,
  adset_id: z.string().min(1).describe("Meta ad set ID to list ads for."),
  date_preset: DatePreset,
  limit: z.number().int().positive().max(500).default(50),
  status_filter: z
    .array(z.enum(["ACTIVE", "PAUSED", "DELETED", "ARCHIVED"]))
    .optional()
    .describe("Filter to ads whose effective_status is in this list."),
  after: z.string().optional().describe("Pagination cursor."),
  name_search: z.string().optional().describe("Substring search on ad name."),
});
type Input = z.infer<typeof Input>;

// Sourced from packages/meta-ads/fixtures/fields-insights.json.
const AD_FIELDS = META_AD_FIELDS;
const INSIGHT_FIELDS = META_INSIGHTS_ADS_LIST;

export const tool: ToolDefinition<Input, unknown> = {
  name: "meta.ads.list",
  description: "List ads in a Meta ad set with creative details and per-ad performance metrics.",
  platform: "meta",
  isWriteTool: false,
  inputSchema: Input,
  handler: async (input, ctx) => {
    const account = ctx.config.getAccount("meta", input.account);
    const client = new MetaClient(account, ctx.rateLimiter);

    const adsQuery: Record<string, string | number | undefined> = {
      fields: AD_FIELDS,
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
    if (filters.length > 0) adsQuery.filtering = JSON.stringify(filters);
    if (input.after) adsQuery.after = input.after;

    const [ads, insights] = await Promise.all([
      client.get(`/${input.adset_id}/ads`, adsQuery),
      client
        .get(`/${input.adset_id}/insights`, {
          fields: INSIGHT_FIELDS,
          date_preset: input.date_preset,
          level: "ad",
          limit: input.limit,
        })
        .catch((err) => ({ data: [], error: (err as Error).message })),
    ]);
    const adsResp = ads as {
      data?: unknown[];
      paging?: { cursors?: { after?: string } };
    };
    return {
      ads: adsResp.data ?? [],
      next_cursor: adsResp.paging?.cursors?.after ?? null,
      insights: (insights as { data?: unknown[] }).data ?? [],
      meta_account_label: account.label,
    };
  },
};
