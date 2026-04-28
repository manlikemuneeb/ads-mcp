import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { z } from "zod";
import { GoogleAdsClient } from "../GoogleAdsClient.js";
import { baseWriteInputShape } from "../schemas.js";
import { audit } from "./_writeUtils.js";

const Input = z.object({
  ...baseWriteInputShape,
  campaign_id: z.string().min(1),
  amount_micros: z
    .number()
    .int()
    .positive()
    .describe(
      "New budget in micros (account currency). 1 USD = 1,000,000 micros. Mutates the linked campaignBudget resource.",
    ),
});
type Input = z.infer<typeof Input>;

interface Output {
  campaign_id: string;
  campaign_budget_resource_name: string;
  previous_amount_micros?: string;
  new_amount_micros: number;
  outcome: "allow_dry_run" | "live_success" | "live_failure";
  google_ads_account_label: string;
}

export const tool: ToolDefinition<Input, Output> = {
  name: "google_ads.campaigns.update_budget",
  description:
    "Update a Google Ads campaign's budget by mutating the linked campaignBudget resource (amount_micros). High-risk; dry-run by default. Resolves the budget resource via GAQL before mutation.",
  platform: "google_ads",
  isWriteTool: true,
  inputSchema: Input,
  handler: async (input, ctx) => {
    const account = ctx.config.getAccount("google_ads", input.account);
    const decision = ctx.dryRunGate.evaluate({
      toolName: "google_ads.campaigns.update_budget",
      platform: "google_ads",
      accountLabel: account.label,
      isWriteTool: true,
      ...(input.dry_run !== undefined ? { dryRunRequested: input.dry_run } : {}),
    });
    const client = new GoogleAdsClient(account, ctx.rateLimiter);

    // Resolve the campaign's linked budget resource and current amount.
    let budgetResourceName: string;
    let previousAmount: string | undefined;
    try {
      const res = (await client.search(
        `SELECT campaign_budget.resource_name, campaign_budget.amount_micros
         FROM campaign WHERE campaign.id = ${input.campaign_id} LIMIT 1`,
      )) as {
        results?: Array<{
          campaignBudget?: { resourceName?: string; amountMicros?: string };
        }>;
      };
      const row = res.results?.[0]?.campaignBudget;
      if (!row?.resourceName) {
        throw new Error(
          `Could not find campaign_budget for campaign ${input.campaign_id}. Either the ID is wrong or the campaign has no linked budget.`,
        );
      }
      budgetResourceName = row.resourceName;
      previousAmount = row.amountMicros;
    } catch (err) {
      // If the lookup itself fails AND we're in live mode, abort. In dry-run,
      // surface the failure as an error too because the tool can't simulate
      // a missing resource accurately.
      throw err;
    }

    const params = { campaign_id: input.campaign_id, amount_micros: input.amount_micros };

    if (decision.outcome === "allow_dry_run") {
      await audit(ctx, {
        tool: "google_ads.campaigns.update_budget",
        account: account.label,
        params,
        dryRun: true,
        outcome: "allow_dry_run",
        resultSummary: `would update ${budgetResourceName} from ${previousAmount ?? "unknown"} to ${input.amount_micros}`,
      });
      return {
        campaign_id: input.campaign_id,
        campaign_budget_resource_name: budgetResourceName,
        ...(previousAmount !== undefined ? { previous_amount_micros: previousAmount } : {}),
        new_amount_micros: input.amount_micros,
        outcome: "allow_dry_run",
        google_ads_account_label: account.label,
      };
    }

    try {
      await client.mutateCampaignBudgets([
        {
          update: { resourceName: budgetResourceName, amountMicros: String(input.amount_micros) },
          updateMask: "amount_micros",
        },
      ]);
      await audit(ctx, {
        tool: "google_ads.campaigns.update_budget",
        account: account.label,
        params,
        dryRun: false,
        outcome: "live_success",
        resultSummary: `updated ${budgetResourceName} to ${input.amount_micros} micros`,
      });
      return {
        campaign_id: input.campaign_id,
        campaign_budget_resource_name: budgetResourceName,
        ...(previousAmount !== undefined ? { previous_amount_micros: previousAmount } : {}),
        new_amount_micros: input.amount_micros,
        outcome: "live_success",
        google_ads_account_label: account.label,
      };
    } catch (err) {
      await audit(ctx, {
        tool: "google_ads.campaigns.update_budget",
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
