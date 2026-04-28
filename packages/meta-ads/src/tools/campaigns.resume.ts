import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { z } from "zod";
import { MetaClient } from "../MetaClient.js";
import { baseWriteInputShape } from "../schemas.js";

const Input = z.object({
  ...baseWriteInputShape,
  campaign_id: z.string().min(1),
});
type Input = z.infer<typeof Input>;

interface Output {
  campaign_id: string;
  previous_status?: string;
  new_status: "ACTIVE";
  outcome: "allow_dry_run" | "live_success" | "live_failure";
  meta_account_label: string;
}

export const tool: ToolDefinition<Input, Output> = {
  name: "meta.campaigns.resume",
  description: "Resume a paused Meta campaign by setting status to ACTIVE. Dry-run by default.",
  platform: "meta",
  isWriteTool: true,
  inputSchema: Input,
  handler: async (input, ctx) => {
    const account = ctx.config.getAccount("meta", input.account);
    const decision = ctx.dryRunGate.evaluate({
      toolName: "meta.campaigns.resume",
      platform: "meta",
      accountLabel: account.label,
      isWriteTool: true,
      ...(input.dry_run !== undefined ? { dryRunRequested: input.dry_run } : {}),
    });

    const client = new MetaClient(account, ctx.rateLimiter);
    let previousStatus: string | undefined;
    try {
      const data = (await client.get(`/${input.campaign_id}`, {
        fields: "status,effective_status",
      })) as { status?: string; effective_status?: string };
      previousStatus = data.status ?? data.effective_status;
    } catch {
      previousStatus = undefined;
    }

    if (decision.outcome === "allow_dry_run") {
      await ctx.auditLogger.log({
        tool: "meta.campaigns.resume",
        platform: "meta",
        account: account.label,
        params: { campaign_id: input.campaign_id },
        dry_run: true,
        outcome: "allow_dry_run",
        result_summary: `would resume campaign ${input.campaign_id} (was ${previousStatus ?? "unknown"})`,
      });
      return {
        campaign_id: input.campaign_id,
        ...(previousStatus !== undefined ? { previous_status: previousStatus } : {}),
        new_status: "ACTIVE",
        outcome: "allow_dry_run",
        meta_account_label: account.label,
      };
    }

    try {
      await client.post(`/${input.campaign_id}`, { status: "ACTIVE" });
      await ctx.auditLogger.log({
        tool: "meta.campaigns.resume",
        platform: "meta",
        account: account.label,
        params: { campaign_id: input.campaign_id },
        dry_run: false,
        outcome: "live_success",
      });
      return {
        campaign_id: input.campaign_id,
        ...(previousStatus !== undefined ? { previous_status: previousStatus } : {}),
        new_status: "ACTIVE",
        outcome: "live_success",
        meta_account_label: account.label,
      };
    } catch (err) {
      await ctx.auditLogger.log({
        tool: "meta.campaigns.resume",
        platform: "meta",
        account: account.label,
        params: { campaign_id: input.campaign_id },
        dry_run: false,
        outcome: "live_failure",
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  },
};
