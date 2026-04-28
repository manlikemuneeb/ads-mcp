import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { z } from "zod";
import { LinkedInClient } from "../LinkedInClient.js";
import { baseWriteInputShape, Money } from "../schemas.js";
import { audit } from "./_writeUtils.js";

const Input = z
  .object({
    ...baseWriteInputShape,
    campaign_id: z.string().min(1),
    daily_budget: Money.optional(),
    total_budget: Money.optional(),
  })
  .refine((v) => (v.daily_budget !== undefined) !== (v.total_budget !== undefined), {
    message: "Exactly one of daily_budget or total_budget must be provided.",
  });
type Input = z.infer<typeof Input>;

interface Output {
  campaign_id: string;
  previous_daily_budget?: { amount: string; currencyCode: string };
  previous_total_budget?: { amount: string; currencyCode: string };
  new_daily_budget?: { amount: string; currencyCode: string };
  new_total_budget?: { amount: string; currencyCode: string };
  outcome: "allow_dry_run" | "live_success" | "live_failure";
  linkedin_account_label: string;
}

export const tool: ToolDefinition<Input, Output> = {
  name: "linkedin.campaigns.update_budget",
  description:
    "Update LinkedIn campaign daily or total budget. Pass exactly one. amount is a decimal string ('100.00') and currency_code is ISO 4217. Dry-run by default; high-risk write.",
  platform: "linkedin",
  isWriteTool: true,
  inputSchema: Input,
  handler: async (input, ctx) => {
    const account = ctx.config.getAccount("linkedin", input.account);
    const decision = ctx.dryRunGate.evaluate({
      toolName: "linkedin.campaigns.update_budget",
      platform: "linkedin",
      accountLabel: account.label,
      isWriteTool: true,
      ...(input.dry_run !== undefined ? { dryRunRequested: input.dry_run } : {}),
    });
    const client = new LinkedInClient(account, ctx.rateLimiter);

    let previousDaily: { amount: string; currencyCode: string } | undefined;
    let previousTotal: { amount: string; currencyCode: string } | undefined;
    try {
      const data = (await client.get(
        `/adAccounts/${account.ad_account_id}/adCampaigns/${input.campaign_id}`,
      )) as {
        dailyBudget?: { amount: string; currencyCode: string };
        totalBudget?: { amount: string; currencyCode: string };
      };
      previousDaily = data.dailyBudget;
      previousTotal = data.totalBudget;
    } catch {
      // best effort
    }

    const setBody: Record<string, unknown> = {};
    if (input.daily_budget) {
      setBody.dailyBudget = {
        amount: input.daily_budget.amount,
        currencyCode: input.daily_budget.currency_code,
      };
    }
    if (input.total_budget) {
      setBody.totalBudget = {
        amount: input.total_budget.amount,
        currencyCode: input.total_budget.currency_code,
      };
    }
    const auditParams = {
      campaign_id: input.campaign_id,
      ...(input.daily_budget ? { daily_budget: input.daily_budget } : {}),
      ...(input.total_budget ? { total_budget: input.total_budget } : {}),
    };

    if (decision.outcome === "allow_dry_run") {
      await audit(ctx, {
        tool: "linkedin.campaigns.update_budget",
        account: account.label,
        params: auditParams,
        dryRun: true,
        outcome: "allow_dry_run",
        resultSummary: `would update budget on campaign ${input.campaign_id}`,
      });
      return {
        campaign_id: input.campaign_id,
        ...(previousDaily ? { previous_daily_budget: previousDaily } : {}),
        ...(previousTotal ? { previous_total_budget: previousTotal } : {}),
        ...(input.daily_budget
          ? {
              new_daily_budget: {
                amount: input.daily_budget.amount,
                currencyCode: input.daily_budget.currency_code,
              },
            }
          : {}),
        ...(input.total_budget
          ? {
              new_total_budget: {
                amount: input.total_budget.amount,
                currencyCode: input.total_budget.currency_code,
              },
            }
          : {}),
        outcome: "allow_dry_run",
        linkedin_account_label: account.label,
      };
    }

    try {
      await client.partialUpdate(
        `/adAccounts/${account.ad_account_id}/adCampaigns/${input.campaign_id}`,
        setBody,
      );
      await audit(ctx, {
        tool: "linkedin.campaigns.update_budget",
        account: account.label,
        params: auditParams,
        dryRun: false,
        outcome: "live_success",
        resultSummary: `budget updated on campaign ${input.campaign_id}`,
      });
      return {
        campaign_id: input.campaign_id,
        ...(previousDaily ? { previous_daily_budget: previousDaily } : {}),
        ...(previousTotal ? { previous_total_budget: previousTotal } : {}),
        ...(input.daily_budget
          ? {
              new_daily_budget: {
                amount: input.daily_budget.amount,
                currencyCode: input.daily_budget.currency_code,
              },
            }
          : {}),
        ...(input.total_budget
          ? {
              new_total_budget: {
                amount: input.total_budget.amount,
                currencyCode: input.total_budget.currency_code,
              },
            }
          : {}),
        outcome: "live_success",
        linkedin_account_label: account.label,
      };
    } catch (err) {
      await audit(ctx, {
        tool: "linkedin.campaigns.update_budget",
        account: account.label,
        params: auditParams,
        dryRun: false,
        outcome: "live_failure",
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  },
};
