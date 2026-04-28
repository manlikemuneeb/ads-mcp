import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { z } from "zod";
import { Ga4Client } from "../Ga4Client.js";
import { baseInputShape } from "../schemas.js";

const Input = z.object({
  ...baseInputShape,
  request_body: z.record(z.unknown()).describe("Raw runPivotReport request body."),
});
type Input = z.infer<typeof Input>;

export const tool: ToolDefinition<Input, unknown> = {
  name: "ga4.report.pivot",
  description: "Run a GA4 pivot report. Body shape per developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/properties/runPivotReport.",
  platform: "ga4",
  isWriteTool: false,
  inputSchema: Input,
  handler: async (input, ctx) => {
    const property = ctx.config.getAccount("ga4", input.account);
    const client = new Ga4Client(property, ctx.rateLimiter);
    const result = await client.data("runPivotReport", input.request_body);
    return { ...(result as Record<string, unknown>), ga4_property_label: property.label };
  },
};
