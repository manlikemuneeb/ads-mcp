import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { z } from "zod";
import { MetaClient } from "../MetaClient.js";
import { baseWriteInputShape } from "../schemas.js";

const Input = z.object({
  ...baseWriteInputShape,
  adset_id: z.string().min(1).describe("Meta ad set ID."),
});
type Input = z.infer<typeof Input>;

interface Output {
  adset_id: string;
  previous_status?: string;
  new_status: "ACTIVE";
  outcome: "allow_dry_run" | "live_success" | "live_failure";
  meta_account_label: string;
}

export const tool: ToolDefinition<Input, Output> = {
  name: "meta.adsets.resume",
  description: "Resume a paused Meta ad set by setting status to ACTIVE. Dry-run by default.",
  platform: "meta",
  isWriteTool: true,
  inputSchema: Input,
  handler: async (input, ctx) => {
    const account = ctx.config.getAccount("meta", input.account);
    const decision = ctx.dryRunGate.evaluate({
      toolName: "meta.adsets.resume",
      platform: "meta",
      accountLabel: account.label,
      isWriteTool: true,
      ...(input.dry_run !== undefined ? { dryRunRequested: input.dry_run } : {}),
    });

    const client = new MetaClient(account, ctx.rateLimiter);
    let previousStatus: string | undefined;
    try {
      const data = (await client.get(`/${input.adset_id}`, {
        fields: "status,effective_status",
      })) as { status?: string; effective_status?: string };
      previousStatus = data.status ?? data.effective_status;
    } catch {
      previousStatus = undefined;
    }

    if (decision.outcome === "allow_dry_run") {
      await ctx.auditLogger.log({
        tool: "meta.adsets.resume",
        platform: "meta",
        account: account.label,
        params: { adset_id: input.adset_id },
        dry_run: true,
        outcome: "allow_dry_run",
        result_summary: `would resume ad set ${input.adset_id} (was ${previousStatus ?? "unknown"})`,
      });
      return {
        adset_id: input.adset_id,
        ...(previousStatus !== undefined ? { previous_status: previousStatus } : {}),
        new_status: "ACTIVE",
        outcome: "allow_dry_run",
        meta_account_label: account.label,
      };
    }

    try {
      await client.post(`/${input.adset_id}`, { status: "ACTIVE" });
      await ctx.auditLogger.log({
        tool: "meta.adsets.resume",
        platform: "meta",
        account: account.label,
        params: { adset_id: input.adset_id },
        dry_run: false,
        outcome: "live_success",
      });
      return {
        adset_id: input.adset_id,
        ...(previousStatus !== undefined ? { previous_status: previousStatus } : {}),
        new_status: "ACTIVE",
        outcome: "live_success",
        meta_account_label: account.label,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await ctx.auditLogger.log({
        tool: "meta.adsets.resume",
        platform: "meta",
        account: account.label,
        params: { adset_id: input.adset_id },
        dry_run: false,
        outcome: "live_failure",
        error: msg,
      });
      throw err;
    }
  },
};
