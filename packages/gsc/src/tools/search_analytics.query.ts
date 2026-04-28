import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { z } from "zod";
import { GscClient, encodeSite } from "../GscClient.js";
import { baseInputShape } from "../schemas.js";

const Input = z.object({
  ...baseInputShape,
  site_url: z.string().optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dimensions: z.array(z.enum(["query", "page", "country", "device", "searchAppearance", "date"])).optional(),
  type: z.enum(["web", "image", "video", "news", "discover", "googleNews"]).optional(),
  dimension_filter_groups: z.array(z.unknown()).optional(),
  aggregation_type: z.enum(["auto", "byPage", "byProperty", "byNewsShowcasePanel"]).optional(),
  row_limit: z.number().int().positive().max(25000).optional(),
  start_row: z.number().int().nonnegative().optional(),
  data_state: z.enum(["all", "final", "hourly_all"]).optional(),
});
type Input = z.infer<typeof Input>;

export const tool: ToolDefinition<Input, unknown> = {
  name: "gsc.search_analytics.query",
  description:
    "Query Search Console search analytics: clicks, impressions, CTR, position by query / page / country / device / etc.",
  platform: "gsc",
  isWriteTool: false,
  inputSchema: Input,
  handler: async (input, ctx) => {
    const site = ctx.config.getAccount("gsc", input.account);
    const client = new GscClient(site, ctx.rateLimiter);
    const targetSite = input.site_url ?? site.site_url;
    const body: Record<string, unknown> = {
      startDate: input.start_date,
      endDate: input.end_date,
    };
    if (input.dimensions) body.dimensions = input.dimensions;
    if (input.type) body.type = input.type;
    if (input.dimension_filter_groups) body.dimensionFilterGroups = input.dimension_filter_groups;
    if (input.aggregation_type) body.aggregationType = input.aggregation_type;
    if (input.row_limit !== undefined) body.rowLimit = input.row_limit;
    if (input.start_row !== undefined) body.startRow = input.start_row;
    if (input.data_state) body.dataState = input.data_state;

    const result = await client.webmasters(
      "POST",
      `/sites/${encodeSite(targetSite)}/searchAnalytics/query`,
      body,
    );
    return { ...(result as Record<string, unknown>), gsc_site_label: site.label, site_url: targetSite };
  },
};
