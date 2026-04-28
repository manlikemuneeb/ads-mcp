// TECH-DEBT(option-c-passthrough): replace with named tools per LinkedIn /rest resource in Phase 2.
import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { z } from "zod";
import { LinkedInClient } from "../LinkedInClient.js";
import { baseInputShape } from "../schemas.js";

const Input = z.object({
  ...baseInputShape,
  path: z.string().min(1).describe("Path under /rest/, e.g. '/adAccountUsers' or '/leadGenForms'."),
  query: z.record(z.string()).optional(),
});
type Input = z.infer<typeof Input>;

export const tool: ToolDefinition<Input, unknown> = {
  name: "linkedin.passthrough.read",
  description: "Escape hatch: GET any LinkedIn /rest endpoint not covered by named tools. Read-only.",
  platform: "linkedin",
  isWriteTool: false,
  inputSchema: Input,
  handler: async (input, ctx) => {
    const account = ctx.config.getAccount("linkedin", input.account);
    const client = new LinkedInClient(account, ctx.rateLimiter);
    const result = await client.get(input.path, input.query ?? {});
    return { ...(result as Record<string, unknown>), linkedin_account_label: account.label };
  },
};
