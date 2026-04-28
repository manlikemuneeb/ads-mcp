import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { z } from "zod";
import { Ga4Client } from "../Ga4Client.js";
import { baseInputShape } from "../schemas.js";

const Input = z.object({
  ...baseInputShape,
  requests: z.array(z.unknown()).min(1).max(5).describe("Up to 5 raw runReport request bodies."),
});
type Input = z.infer<typeof Input>;

export const tool: ToolDefinition<Input, unknown> = {
  name: "ga4.report.batch",
  description: "Run up to 5 GA4 reports in a single call (batchRunReports).",
  platform: "ga4",
  isWriteTool: false,
  inputSchema: Input,
  handler: async (input, ctx) => {
    const property = ctx.config.getAccount("ga4", input.account);
    const client = new Ga4Client(property, ctx.rateLimiter);
    const result = await client.data("batchRunReports", { requests: input.requests });
    return { ...(result as Record<string, unknown>), ga4_property_label: property.label };
  },
};
