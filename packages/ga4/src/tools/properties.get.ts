import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { z } from "zod";
import { Ga4Client } from "../Ga4Client.js";
import { baseInputShape } from "../schemas.js";

const Input = z.object({
  ...baseInputShape,
  property_id: z.string().min(1).optional().describe("Override the configured property id."),
});
type Input = z.infer<typeof Input>;

export const tool: ToolDefinition<Input, unknown> = {
  name: "ga4.properties.get",
  description: "Get details of a GA4 property.",
  platform: "ga4",
  isWriteTool: false,
  inputSchema: Input,
  handler: async (input, ctx) => {
    const property = ctx.config.getAccount("ga4", input.account);
    const client = new Ga4Client(property, ctx.rateLimiter);
    const id = input.property_id ?? property.property_id;
    const result = await client.admin("GET", `/properties/${id}`);
    return { ...(result as Record<string, unknown>), ga4_property_label: property.label };
  },
};
