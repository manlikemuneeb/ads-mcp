// TECH-DEBT(option-c-passthrough): replace with named tools per Graph API resource in Phase 2.
import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { z } from "zod";
import { MetaClient } from "../MetaClient.js";
import { baseInputShape } from "../schemas.js";

const Input = z.object({
  ...baseInputShape,
  path: z
    .string()
    .min(1)
    .describe("Graph API path, e.g. '/me' or '/{ad_account_id}/customaudiences'."),
  query: z.record(z.string()).optional().describe("Query string params."),
});
type Input = z.infer<typeof Input>;

export const tool: ToolDefinition<Input, unknown> = {
  name: "meta.passthrough.read",
  description:
    "Escape hatch: GET any Meta Graph API endpoint not covered by named tools. Read-only. Pass `path` like '/{account}/customaudiences' and optional query map.",
  platform: "meta",
  isWriteTool: false,
  inputSchema: Input,
  handler: async (input, ctx) => {
    const account = ctx.config.getAccount("meta", input.account);
    const client = new MetaClient(account, ctx.rateLimiter);
    const result = await client.get(input.path, input.query ?? {});
    return { ...(result as Record<string, unknown>), meta_account_label: account.label };
  },
};
