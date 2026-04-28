import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { z } from "zod";
import { Ga4Client } from "../Ga4Client.js";
import { baseInputShape } from "../schemas.js";

const Input = z.object({
  ...baseInputShape,
  page_size: z.number().int().positive().max(200).optional(),
  page_token: z.string().optional(),
});
type Input = z.infer<typeof Input>;

export const tool: ToolDefinition<Input, unknown> = {
  name: "ga4.data_streams.list",
  description: "List data streams attached to the configured GA4 property.",
  platform: "ga4",
  isWriteTool: false,
  inputSchema: Input,
  handler: async (input, ctx) => {
    const property = ctx.config.getAccount("ga4", input.account);
    const client = new Ga4Client(property, ctx.rateLimiter);
    const query: Record<string, string | undefined> = {};
    if (input.page_size !== undefined) query.pageSize = String(input.page_size);
    if (input.page_token) query.pageToken = input.page_token;
    const result = await client.admin(
      "GET",
      `/properties/${property.property_id}/dataStreams`,
      undefined,
      query,
    );
    return { ...(result as Record<string, unknown>), ga4_property_label: property.label };
  },
};
