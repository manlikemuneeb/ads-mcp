import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { z } from "zod";
import { MetaClient } from "../MetaClient.js";
import { baseWriteInputShape } from "../schemas.js";

const Input = z.object({
  ...baseWriteInputShape,
  ad_id: z.string().min(1),
});
type Input = z.infer<typeof Input>;

export const tool: ToolDefinition<Input, unknown> = {
  name: "meta.ads.delete",
  description:
    "DELETE a Meta ad. Irreversible. For temporary teardown prefer meta.ads.update with status=ARCHIVED. Dry-run by default; high-risk write.",
  platform: "meta",
  isWriteTool: true,
  inputSchema: Input,
  handler: async (input, ctx) => {
    const account = ctx.config.getAccount("meta", input.account);
    const decision = ctx.dryRunGate.evaluate({
      toolName: "meta.ads.delete",
      platform: "meta",
      accountLabel: account.label,
      isWriteTool: true,
      ...(input.dry_run !== undefined ? { dryRunRequested: input.dry_run } : {}),
    });
    const client = new MetaClient(account, ctx.rateLimiter);

    let previous: Record<string, unknown> = {};
    try {
      previous = (await client.get(`/${input.ad_id}`, {
        fields: "name,status,adset_id",
      })) as Record<string, unknown>;
    } catch {
      previous = {};
    }

    if (decision.outcome === "allow_dry_run") {
      await ctx.auditLogger.log({
        tool: "meta.ads.delete",
        platform: "meta",
        account: account.label,
        params: { ad_id: input.ad_id },
        dry_run: true,
        outcome: "allow_dry_run",
        result_summary: `would DELETE ad ${input.ad_id} (was "${previous.name ?? "unknown"}")`,
      });
      return {
        ad_id: input.ad_id,
        previous,
        outcome: "allow_dry_run",
        meta_account_label: account.label,
      };
    }

    try {
      await client.delete(`/${input.ad_id}`);
      await ctx.auditLogger.log({
        tool: "meta.ads.delete",
        platform: "meta",
        account: account.label,
        params: { ad_id: input.ad_id },
        dry_run: false,
        outcome: "live_success",
        result_summary: `DELETED ad ${input.ad_id}`,
      });
      return {
        ad_id: input.ad_id,
        previous,
        outcome: "live_success",
        meta_account_label: account.label,
      };
    } catch (err) {
      await ctx.auditLogger.log({
        tool: "meta.ads.delete",
        platform: "meta",
        account: account.label,
        params: { ad_id: input.ad_id },
        dry_run: false,
        outcome: "live_failure",
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  },
};
