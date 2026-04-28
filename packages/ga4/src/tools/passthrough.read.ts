// TECH-DEBT(option-c-passthrough): replace with named tools per Admin API resource in Phase 2.
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
  admin_query: z.record(z.string()).optional(),
});
type Input = z.infer<typeof Input>;

export const tool: ToolDefinition<Input, unknown> = {
  name: "ga4.passthrough.read",
  description:
    "Escape hatch: call any GA4 Data API method (POST) or Admin API GET endpoint not yet covered by named tools. Read-only — no mutations.",
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
    const result = await client.admin("GET", input.admin_path, undefined, input.admin_query ?? {});
    return { ...(result as Record<string, unknown>), ga4_property_label: property.label };
  },
};
