// TECH-DEBT(option-c-passthrough): replace with named tools per Graph API resource in Phase 2.
import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { z } from "zod";
import { MetaClient } from "../MetaClient.js";
import { baseWriteInputShape } from "../schemas.js";

const Input = z.object({
  ...baseWriteInputShape,
  method: z.enum(["POST", "DELETE"]),
  path: z.string().min(1).describe("Graph API path."),
  body: z.record(z.unknown()).optional(),
  confirm_passthrough: z.literal(true),
});
type Input = z.infer<typeof Input>;

export const tool: ToolDefinition<Input, unknown> = {
  name: "meta.passthrough.write",
  description:
    "Escape hatch: POST/DELETE any Meta Graph API endpoint. Requires confirm_passthrough=true. Dry-run by default. Logged.",
  platform: "meta",
  isWriteTool: true,
  inputSchema: Input,
  handler: async (input, ctx) => {
    const account = ctx.config.getAccount("meta", input.account);
    const decision = ctx.dryRunGate.evaluate({
      toolName: "meta.passthrough.write",
      platform: "meta",
      accountLabel: account.label,
      isWriteTool: true,
      ...(input.dry_run !== undefined ? { dryRunRequested: input.dry_run } : {}),
    });
    const client = new MetaClient(account, ctx.rateLimiter);
    const params = {
      method: input.method,
      path: input.path,
      ...(input.body ? { body: input.body } : {}),
    };

    if (decision.outcome === "allow_dry_run") {
      await ctx.auditLogger.log({
        tool: "meta.passthrough.write",
        platform: "meta",
        account: account.label,
        params,
        dry_run: true,
        outcome: "allow_dry_run",
        result_summary: `would ${input.method} ${input.path}`,
      });
      return { outcome: "allow_dry_run", method: input.method, path: input.path, meta_account_label: account.label };
    }

    try {
      const result =
        input.method === "POST"
          ? await client.post(input.path, input.body ?? {})
          : await client.delete(input.path);
      await ctx.auditLogger.log({
        tool: "meta.passthrough.write",
        platform: "meta",
        account: account.label,
        params,
        dry_run: false,
        outcome: "live_success",
      });
      return { ...(result as Record<string, unknown>), outcome: "live_success", meta_account_label: account.label };
    } catch (err) {
      await ctx.auditLogger.log({
        tool: "meta.passthrough.write",
        platform: "meta",
        account: account.label,
        params,
        dry_run: false,
        outcome: "live_failure",
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  },
};
