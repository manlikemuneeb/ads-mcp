// Fallback for GA4 reads not covered by named tools.
import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { z } from "zod";
import { Ga4Client } from "../Ga4Client.js";
import { baseInputShape } from "../schemas.js";

const Input = z.object({
  ...baseInputShape,
  api: z.enum(["data", "admin"]).default("admin"),
  data_method: z
    .string()
    .optional()
    .describe("For api=data, the colon method (e.g. 'runReport', 'runRealtimeReport')."),
  data_body: z.record(z.unknown()).optional(),
  admin_path: z
    .string()
    .optional()
    .describe("For api=admin, the path under /v1beta/, e.g. '/properties/123/audiences'."),
  admin_query: z
    .record(z.union([z.string(), z.number(), z.boolean()]))
    .optional()
    .describe("Query params for admin GETs. Numbers and booleans are coerced to strings."),
});
type Input = z.infer<typeof Input>;

export const tool: ToolDefinition<Input, unknown> = {
  name: "ga4.passthrough.read",
  description:
    "Fallback: call any GA4 Data API method (POST) or Admin API GET endpoint not yet covered by named tools. Read-only. Prefer ga4.report.run, ga4.report.realtime, ga4.report.batch, ga4.report.pivot, ga4.accounts.list, ga4.properties.* when those fit.",
  platform: "ga4",
  isWriteTool: false,
  inputSchema: Input,
  handler: async (input, ctx) => {
    const property = ctx.config.getAccount("ga4", input.account);
    const client = new Ga4Client(property, ctx.rateLimiter);
    if (input.api === "data") {
      if (!input.data_method) throw new Error("data_method required when api=data");
      const result = await client.data(input.data_method, input.data_body ?? {});
      return { ...(result as Record<string, unknown>), ga4_property_label: property.label };
    }
    if (!input.admin_path) throw new Error("admin_path required when api=admin");
    const coerced: Record<string, string> = {};
    if (input.admin_query) {
      for (const [k, v] of Object.entries(input.admin_query)) coerced[k] = String(v);
    }
    const result = await client.admin("GET", input.admin_path, undefined, coerced);
    return { ...(result as Record<string, unknown>), ga4_property_label: property.label };
  },
};
