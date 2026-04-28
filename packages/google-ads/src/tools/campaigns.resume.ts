import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { z } from "zod";
import { GoogleAdsClient } from "../GoogleAdsClient.js";
import { baseWriteInputShape } from "../schemas.js";
import { audit } from "./_writeUtils.js";

const Input = z.object({
  ...baseWriteInputShape,
  campaign_id: z.string().min(1),
});
type Input = z.infer<typeof Input>;

interface Output {
  campaign_id: string;
  resource_name: string;
  previous_status?: string;
  new_status: "ENABLED";
  outcome: "allow_dry_run" | "live_success" | "live_failure";
  google_ads_account_label: string;
}

export const tool: ToolDefinition<Input, Output> = {
  name: "google_ads.campaigns.resume",
  description:
    "Resume a paused Google Ads campaign by setting campaign.status to ENABLED. Dry-run by default.",
  platform: "google_ads",
  isWriteTool: true,
  inputSchema: Input,
  handler: async (input, ctx) => {
    const account = ctx.config.getAccount("google_ads", input.account);
    const decision = ctx.dryRunGate.evaluate({
      toolName: "google_ads.campaigns.resume",
      platform: "google_ads",
      accountLabel: account.label,
      isWriteTool: true,
      ...(input.dry_run !== undefined ? { dryRunRequested: input.dry_run } : {}),
    });
    const client = new GoogleAdsClient(account, ctx.rateLimiter);
    const resourceName = `customers/${client.getCustomerId()}/campaigns/${input.campaign_id}`;

    let previousStatus: string | undefined;
    try {
      const res = (await client.search(
        `SELECT campaign.status FROM campaign WHERE campaign.id = ${input.campaign_id} LIMIT 1`,
      )) as { results?: Array<{ campaign?: { status?: string } }> };
      previousStatus = res.results?.[0]?.campaign?.status;
    } catch {
      previousStatus = undefined;
    }

    if (decision.outcome === "allow_dry_run") {
      await audit(ctx, {
        tool: "google_ads.campaigns.resume",
        account: account.label,
        params: { campaign_id: input.campaign_id },
        dryRun: true,
        outcome: "allow_dry_run",
        resultSummary: `would resume ${resourceName} (was ${previousStatus ?? "unknown"})`,
      });
      return {
        campaign_id: input.campaign_id,
        resource_name: resourceName,
        ...(previousStatus !== undefined ? { previous_status: previousStatus } : {}),
        new_status: "ENABLED",
        outcome: "allow_dry_run",
        google_ads_account_label: account.label,
      };
    }

    try {
      await client.mutateCampaigns([
        { update: { resourceName, status: "ENABLED" }, updateMask: "status" },
      ]);
      await audit(ctx, {
        tool: "google_ads.campaigns.resume",
        account: account.label,
        params: { campaign_id: input.campaign_id },
        dryRun: false,
        outcome: "live_success",
      });
      return {
        campaign_id: input.campaign_id,
        resource_name: resourceName,
        ...(previousStatus !== undefined ? { previous_status: previousStatus } : {}),
        new_status: "ENABLED",
        outcome: "live_success",
        google_ads_account_label: account.label,
      };
    } catch (err) {
      await audit(ctx, {
        tool: "google_ads.campaigns.resume",
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
