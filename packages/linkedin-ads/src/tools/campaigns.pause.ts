import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { z } from "zod";
import { LinkedInClient } from "../LinkedInClient.js";
import { baseWriteInputShape } from "../schemas.js";
import { audit } from "./_writeUtils.js";

const Input = z.object({
  ...baseWriteInputShape,
  campaign_id: z.string().min(1),
});
type Input = z.infer<typeof Input>;

interface Output {
  campaign_id: string;
  previous_status?: string;
  new_status: "PAUSED";
  outcome: "allow_dry_run" | "live_success" | "live_failure";
  linkedin_account_label: string;
}

export const tool: ToolDefinition<Input, Output> = {
  name: "linkedin.campaigns.pause",
  description: "Pause a LinkedIn campaign by PARTIAL_UPDATE to status=PAUSED. Reversible. Dry-run by default.",
  platform: "linkedin",
  isWriteTool: true,
  inputSchema: Input,
  handler: async (input, ctx) => {
    const account = ctx.config.getAccount("linkedin", input.account);
    const decision = ctx.dryRunGate.evaluate({
      toolName: "linkedin.campaigns.pause",
      platform: "linkedin",
      accountLabel: account.label,
      isWriteTool: true,
      ...(input.dry_run !== undefined ? { dryRunRequested: input.dry_run } : {}),
    });
    const client = new LinkedInClient(account, ctx.rateLimiter);

    let previousStatus: string | undefined;
    try {
      const data = (await client.get(
        `/adAccounts/${account.ad_account_id}/adCampaigns/${input.campaign_id}`,
      )) as { status?: string };
      previousStatus = data.status;
    } catch {
      previousStatus = undefined;
    }

    if (decision.outcome === "allow_dry_run") {
      await audit(ctx, {
        tool: "linkedin.campaigns.pause",
        account: account.label,
        params: { campaign_id: input.campaign_id },
        dryRun: true,
        outcome: "allow_dry_run",
        resultSummary: `would pause campaign ${input.campaign_id} (was ${previousStatus ?? "unknown"})`,
      });
      return {
        campaign_id: input.campaign_id,
        ...(previousStatus !== undefined ? { previous_status: previousStatus } : {}),
        new_status: "PAUSED",
        outcome: "allow_dry_run",
        linkedin_account_label: account.label,
      };
    }

    try {
      await client.partialUpdate(
        `/adAccounts/${account.ad_account_id}/adCampaigns/${input.campaign_id}`,
        { status: "PAUSED" },
      );
      await audit(ctx, {
        tool: "linkedin.campaigns.pause",
        account: account.label,
        params: { campaign_id: input.campaign_id },
        dryRun: false,
        outcome: "live_success",
      });
      return {
        campaign_id: input.campaign_id,
        ...(previousStatus !== undefined ? { previous_status: previousStatus } : {}),
        new_status: "PAUSED",
        outcome: "live_success",
        linkedin_account_label: account.label,
      };
    } catch (err) {
      await audit(ctx, {
        tool: "linkedin.campaigns.pause",
        account: account.label,
        params: { campaign_id: input.campaign_id },
        dryRun: false,
        outcome: "live_failure",
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  },
};
