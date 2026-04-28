// Fallback path for LinkedIn /rest endpoints not yet covered by named tools.
// Prefer named tools (linkedin.campaigns.pause/resume/update_budget,
// linkedin.creatives.pause/resume) — they validate inputs and produce
// richer audit entries. Passthrough handles long-tail endpoints.
import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { z } from "zod";
import { LinkedInClient } from "../LinkedInClient.js";
import { baseWriteInputShape } from "../schemas.js";
import { audit } from "./_writeUtils.js";

const Input = z.object({
  ...baseWriteInputShape,
  method: z.enum(["POST", "PARTIAL_UPDATE", "DELETE"]),
  path: z.string().min(1),
  body: z.record(z.unknown()).optional(),
  partial_update_set: z
    .record(z.unknown())
    .optional()
    .describe("For method=PARTIAL_UPDATE, the $set object."),
  confirm_passthrough: z.literal(true),
});
type Input = z.infer<typeof Input>;

export const tool: ToolDefinition<Input, unknown> = {
  name: "linkedin.passthrough.write",
  description:
    "Fallback: POST/PARTIAL_UPDATE/DELETE any LinkedIn /rest endpoint. Use only when no named tool exists. Prefer linkedin.campaigns.pause/resume/update_budget, linkedin.creatives.pause/resume. Requires confirm_passthrough=true. Dry-run by default.",
  platform: "linkedin",
  isWriteTool: true,
  inputSchema: Input,
  handler: async (input, ctx) => {
    const account = ctx.config.getAccount("linkedin", input.account);
    const decision = ctx.dryRunGate.evaluate({
      toolName: "linkedin.passthrough.write",
      platform: "linkedin",
      accountLabel: account.label,
      isWriteTool: true,
      ...(input.dry_run !== undefined ? { dryRunRequested: input.dry_run } : {}),
    });
    const client = new LinkedInClient(account, ctx.rateLimiter);
    const params = {
      method: input.method,
      path: input.path,
      ...(input.body ? { body: input.body } : {}),
      ...(input.partial_update_set ? { partial_update_set: input.partial_update_set } : {}),
    };

    if (decision.outcome === "allow_dry_run") {
      await audit(ctx, {
        tool: "linkedin.passthrough.write",
        account: account.label,
        params,
        dryRun: true,
        outcome: "allow_dry_run",
        resultSummary: `would ${input.method} ${input.path}`,
      });
      return { outcome: "allow_dry_run", method: input.method, path: input.path, linkedin_account_label: account.label };
    }

    try {
      let result: unknown;
      if (input.method === "POST") {
        result = await client.post(input.path, input.body ?? {});
      } else if (input.method === "PARTIAL_UPDATE") {
        if (!input.partial_update_set) throw new Error("partial_update_set required for PARTIAL_UPDATE");
        result = await client.partialUpdate(input.path, input.partial_update_set);
      } else {
        // DELETE: LinkedInClient has no delete(); use the request internals via partialUpdate-style approach
        throw new Error("DELETE via passthrough not yet implemented; use named tools or open an issue.");
      }
      await audit(ctx, {
        tool: "linkedin.passthrough.write",
        account: account.label,
        params,
        dryRun: false,
        outcome: "live_success",
      });
      return { ...(result as Record<string, unknown>), outcome: "live_success", linkedin_account_label: account.label };
    } catch (err) {
      await audit(ctx, {
        tool: "linkedin.passthrough.write",
        account: account.label,
        params,
        dryRun: false,
        outcome: "live_failure",
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  },
};
