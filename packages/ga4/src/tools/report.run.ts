import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { z } from "zod";
import { Ga4Client } from "../Ga4Client.js";
import { baseInputShape } from "../schemas.js";

const Dimension = z.object({ name: z.string() });
const Metric = z.object({ name: z.string(), expression: z.string().optional() });
const DateRange = z.object({
  start_date: z.string(),
  end_date: z.string(),
  name: z.string().optional(),
});

const Input = z.object({
  ...baseInputShape,
  date_ranges: z.array(DateRange).min(1),
  dimensions: z.array(Dimension).optional(),
  metrics: z.array(Metric).min(1),
  dimension_filter: z.unknown().optional().describe("Raw GA4 FilterExpression"),
  metric_filter: z.unknown().optional().describe("Raw GA4 FilterExpression"),
  order_bys: z.array(z.unknown()).optional(),
  limit: z.number().int().positive().max(100000).optional(),
  offset: z.number().int().nonnegative().optional(),
  keep_empty_rows: z.boolean().optional(),
  return_property_quota: z.boolean().optional(),
});
type Input = z.infer<typeof Input>;

export const tool: ToolDefinition<Input, unknown> = {
  name: "ga4.report.run",
  description:
    "Run a GA4 Data API report. Pass dimensions, metrics, and date_ranges (with start_date/end_date as 'YYYY-MM-DD' or relative tokens like '7daysAgo'). Returns the raw runReport response.",
  platform: "ga4",
  isWriteTool: false,
  inputSchema: Input,
  handler: async (input, ctx) => {
    const property = ctx.config.getAccount("ga4", input.account);
    const client = new Ga4Client(property, ctx.rateLimiter);
    const body: Record<string, unknown> = {
      dateRanges: input.date_ranges.map((r) => ({
        startDate: r.start_date,
        endDate: r.end_date,
        ...(r.name ? { name: r.name } : {}),
      })),
      metrics: input.metrics,
    };
    if (input.dimensions) body.dimensions = input.dimensions;
    if (input.dimension_filter) body.dimensionFilter = input.dimension_filter;
    if (input.metric_filter) body.metricFilter = input.metric_filter;
    if (input.order_bys) body.orderBys = input.order_bys;
    if (input.limit !== undefined) body.limit = String(input.limit);
    if (input.offset !== undefined) body.offset = String(input.offset);
    if (input.keep_empty_rows !== undefined) body.keepEmptyRows = input.keep_empty_rows;
    if (input.return_property_quota !== undefined) body.returnPropertyQuota = input.return_property_quota;

    const result = await client.data("runReport", body);
    return { ...(result as Record<string, unknown>), ga4_property_label: property.label };
  },
};
