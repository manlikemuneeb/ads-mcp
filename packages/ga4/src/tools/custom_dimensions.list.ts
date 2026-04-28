import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { z } from "zod";
import { Ga4Client } from "../Ga4Client.js";
import { baseInputShape } from "../schemas.js";

const Input = z.object({ ...baseInputShape });
type Input = z.infer<typeof Input>;

export const tool: ToolDefinition<Input, unknown> = {
  name: "ga4.custom_dimensions.list",
  description: "List custom dimensions on the configured GA4 property.",
  platform: "ga4",
  isWriteTool: false,
  inputSchema: Input,
  handler: async (input, ctx) => {
    const property = ctx.config.getAccount("ga4", input.account);
    const client = new Ga4Client(property, ctx.rateLimiter);
    const result = await client.admin("GET", `/properties/${property.property_id}/customDimensions`);
    return { ...(result as Record<string, unknown>), ga4_property_label: property.label };
  },
};
