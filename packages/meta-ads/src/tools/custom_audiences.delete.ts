import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { z } from "zod";
import { MetaClient } from "../MetaClient.js";
import { baseWriteInputShape } from "../schemas.js";

const Input = z.object({
  ...baseWriteInputShape,
  audience_id: z.string().min(1),
});
type Input = z.infer<typeof Input>;

export const tool: ToolDefinition<Input, unknown> = {
  name: "meta.custom_audiences.delete",
  description:
    "DELETE a Meta custom audience. Irreversible. Active ad sets using this audience continue running but will report 'audience deleted' in Ads Manager. Dry-run by default; high-risk write.",
  platform: "meta",
  isWriteTool: true,
  inputSchema: Input,
  handler: async (input, ctx) => {
    const account = ctx.config.getAccount("meta", input.account);
    const decision = ctx.dryRunGate.evaluate({
      toolName: "meta.custom_audiences.delete",
      platform: "meta",
      accountLabel: account.label,
      isWriteTool: true,
      ...(input.dry_run !== undefined ? { dryRunRequested: input.dry_run } : {}),
    });
    const client = new MetaClient(account, ctx.rateLimiter);

    let previous: Record<string, unknown> = {};
    try {
      previous = (await client.get(`/${input.audience_id}`, {
        fields: "name,subtype,approximate_count_lower_bound,approximate_count_upper_bound",
      })) as Record<string, unknown>;
    } catch {
      previous = {};
    }

    if (decision.outcome === "allow_dry_run") {
      await ctx.auditLogger.log({
        tool: "meta.custom_audiences.delete",
        platform: "meta",
        account: account.label,
        params: { audience_id: input.audience_id },
        dry_run: true,
        outcome: "allow_dry_run",
        result_summary: `would DELETE audience ${input.audience_id} (was "${previous.name ?? "unknown"}")`,
      });
      return {
        audience_id: input.audience_id,
        previous,
        outcome: "allow_dry_run",
        meta_account_label: account.label,
      };
    }

    try {
      await client.delete(`/${input.audience_id}`);
      await ctx.auditLogger.log({
        tool: "meta.custom_audiences.delete",
        platform: "meta",
        account: account.label,
        params: { audience_id: input.audience_id },
        dry_run: false,
        outcome: "live_success",
        result_summary: `DELETED audience ${input.audience_id}`,
      });
      return {
        audience_id: input.audience_id,
        previous,
        outcome: "live_success",
        meta_account_label: account.label,
      };
    } catch (err) {
      await ctx.auditLogger.log({
        tool: "meta.custom_audiences.delete",
        platform: "meta",
        account: account.label,
        params: { audience_id: input.audience_id },
        dry_run: false,
        outcome: "live_failure",
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  },
};
