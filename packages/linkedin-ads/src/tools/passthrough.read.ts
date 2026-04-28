// Fallback for LinkedIn /rest GETs not covered by named tools.
import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { z } from "zod";
import { LinkedInClient } from "../LinkedInClient.js";
import { baseInputShape } from "../schemas.js";

const Input = z.object({
  ...baseInputShape,
  path: z.string().min(1).describe("Path under /rest/, e.g. '/adAccountUsers' or '/leadGenForms'."),
  query: z
    .record(z.union([z.string(), z.number(), z.boolean()]))
    .optional()
    .describe(
      "Query string params. Numbers and booleans are accepted and coerced to strings.",
    ),
});
type Input = z.infer<typeof Input>;

export const tool: ToolDefinition<Input, unknown> = {
  name: "linkedin.passthrough.read",
  description:
    "Fallback: GET any LinkedIn /rest endpoint not covered by named tools. Read-only. Prefer linkedin.account.overview, linkedin.campaigns.list, linkedin.analytics, linkedin.creatives.list when those fit.",
  platform: "linkedin",
  isWriteTool: false,
  inputSchema: Input,
  handler: async (input, ctx) => {
    const account = ctx.config.getAccount("linkedin", input.account);
    const client = new LinkedInClient(account, ctx.rateLimiter);
    const coerced: Record<string, string> = {};
    if (input.query) {
      for (const [k, v] of Object.entries(input.query)) coerced[k] = String(v);
    }
    const result = await client.get(input.path, coerced);
    return { ...(result as Record<string, unknown>), linkedin_account_label: account.label };
  },
};
