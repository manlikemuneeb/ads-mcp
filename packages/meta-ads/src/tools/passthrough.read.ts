// Fallback path for Graph API GETs not covered by named tools.
// Prefer named tools over passthrough — they validate inputs, surface
// dry-run previews on writes, and produce richer audit log entries.
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
  query: z
    .record(z.union([z.string(), z.number(), z.boolean()]))
    .optional()
    .describe(
      "Query string params. Numbers and booleans are accepted and coerced to strings (Meta's API accepts both, but the URL needs strings on the wire).",
    ),
});
type Input = z.infer<typeof Input>;

export const tool: ToolDefinition<Input, unknown> = {
  name: "meta.passthrough.read",
  description:
    "Fallback: GET any Meta Graph API endpoint not covered by named tools. Read-only. Prefer named tools (meta.targeting.search for /search, meta.delivery_estimate for reach prediction, meta.insights.* for /insights, etc.). Pass `path` like '/{account}/customaudiences' and optional query map (string|number|boolean values).",
  platform: "meta",
  isWriteTool: false,
  inputSchema: Input,
  handler: async (input, ctx) => {
    const account = ctx.config.getAccount("meta", input.account);
    const client = new MetaClient(account, ctx.rateLimiter);
    // Coerce non-string query values to strings so Meta's URL builder
    // is happy regardless of how the LLM formatted them.
    const coerced: Record<string, string> = {};
    if (input.query) {
      for (const [k, v] of Object.entries(input.query)) {
        coerced[k] = String(v);
      }
    }
    const result = await client.get(input.path, coerced);
    return { ...(result as Record<string, unknown>), meta_account_label: account.label };
  },
};
