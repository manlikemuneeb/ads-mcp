import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { z } from "zod";
import { Ga4Client } from "../Ga4Client.js";
import { baseInputShape } from "../schemas.js";

const Input = z.object({
  ...baseInputShape,
  dimensions: z.array(z.object({ name: z.string() })).optional(),
  metrics: z.array(z.object({ name: z.string() })).min(1),
  limit: z.number().int().positive().max(100000).optional(),
});
type Input = z.infer<typeof Input>;

export const tool: ToolDefinition<Input, unknown> = {
  name: "ga4.report.realtime",
  description: "Run a GA4 realtime report (last 30 minutes of activity).",
  platform: "ga4",
  isWriteTool: false,
  inputSchema: Input,
  handler: async (input, ctx) => {
    const property = ctx.config.getAccount("ga4", input.account);
    const client = new Ga4Client(property, ctx.rateLimiter);
    const body: Record<string, unknown> = { metrics: input.metrics };
    if (input.dimensions) body.dimensions = input.dimensions;
    if (input.limit !== undefined) body.limit = String(input.limit);
    const result = await client.data("runRealtimeReport", body);
    return { ...(result as Record<string, unknown>), ga4_property_label: property.label };
  },
};
