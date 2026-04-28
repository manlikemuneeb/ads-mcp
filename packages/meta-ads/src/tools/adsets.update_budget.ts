import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { z } from "zod";
import { MetaClient } from "../MetaClient.js";
import { baseWriteInputShape } from "../schemas.js";

const Input = z
  .object({
    ...baseWriteInputShape,
    adset_id: z.string().min(1).describe("Meta ad set ID."),
    daily_budget_cents: z
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        "Daily budget in account-currency cents (e.g. 5000 = $50.00). Mutually exclusive with lifetime_budget_cents.",
      ),
    lifetime_budget_cents: z
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        "Lifetime budget in account-currency cents. Mutually exclusive with daily_budget_cents.",
      ),
  })
  .refine(
    (v) => (v.daily_budget_cents !== undefined) !== (v.lifetime_budget_cents !== undefined),
    {
      message: "Exactly one of daily_budget_cents or lifetime_budget_cents must be provided.",
    },
  );
type Input = z.infer<typeof Input>;

interface Output {
  adset_id: string;
  previous_daily_budget?: string;
  previous_lifetime_budget?: string;
  new_daily_budget_cents?: number;
  new_lifetime_budget_cents?: number;
  outcome: "allow_dry_run" | "live_success" | "live_failure";
  meta_account_label: string;
}

export const tool: ToolDefinition<Input, Output> = {
  name: "meta.adsets.update_budget",
  description:
    "Update a Meta ad set's daily or lifetime budget. Pass exactly one of daily_budget_cents or lifetime_budget_cents in account-currency cents. Dry-run by default; high-risk write.",
  platform: "meta",
  isWriteTool: true,
  inputSchema: Input,
  handler: async (input, ctx) => {
    const account = ctx.config.getAccount("meta", input.account);
    const decision = ctx.dryRunGate.evaluate({
      toolName: "meta.adsets.update_budget",
      platform: "meta",
      accountLabel: account.label,
      isWriteTool: true,
      ...(input.dry_run !== undefined ? { dryRunRequested: input.dry_run } : {}),
    });

    const client = new MetaClient(account, ctx.rateLimiter);

    let previousDaily: string | undefined;
    let previousLifetime: string | undefined;
    try {
      const data = (await client.get(`/${input.adset_id}`, {
        fields: "daily_budget,lifetime_budget",
      })) as { daily_budget?: string; lifetime_budget?: string };
      previousDaily = data.daily_budget;
      previousLifetime = data.lifetime_budget;
    } catch {
      // best-effort preview
    }

    const body: Record<string, unknown> = {};
    if (input.daily_budget_cents !== undefined) body.daily_budget = input.daily_budget_cents;
    if (input.lifetime_budget_cents !== undefined)
      body.lifetime_budget = input.lifetime_budget_cents;

    const params = {
      adset_id: input.adset_id,
      ...(input.daily_budget_cents !== undefined
        ? { daily_budget_cents: input.daily_budget_cents }
        : {}),
      ...(input.lifetime_budget_cents !== undefined
        ? { lifetime_budget_cents: input.lifetime_budget_cents }
        : {}),
    };

    if (decision.outcome === "allow_dry_run") {
      await ctx.auditLogger.log({
        tool: "meta.adsets.update_budget",
        platform: "meta",
        account: account.label,
        params,
        dry_run: true,
        outcome: "allow_dry_run",
        result_summary: `would update budget on ad set ${input.adset_id}`,
      });
      return {
        adset_id: input.adset_id,
        ...(previousDaily !== undefined ? { previous_daily_budget: previousDaily } : {}),
        ...(previousLifetime !== undefined ? { previous_lifetime_budget: previousLifetime } : {}),
        ...(input.daily_budget_cents !== undefined
          ? { new_daily_budget_cents: input.daily_budget_cents }
          : {}),
        ...(input.lifetime_budget_cents !== undefined
          ? { new_lifetime_budget_cents: input.lifetime_budget_cents }
          : {}),
        outcome: "allow_dry_run",
        meta_account_label: account.label,
      };
    }

    try {
      await client.post(`/${input.adset_id}`, body);
      await ctx.auditLogger.log({
        tool: "meta.adsets.update_budget",
        platform: "meta",
        account: account.label,
        params,
        dry_run: false,
        outcome: "live_success",
        result_summary: `budget updated on ad set ${input.adset_id}`,
      });
      return {
        adset_id: input.adset_id,
        ...(previousDaily !== undefined ? { previous_daily_budget: previousDaily } : {}),
        ...(previousLifetime !== undefined ? { previous_lifetime_budget: previousLifetime } : {}),
        ...(input.daily_budget_cents !== undefined
          ? { new_daily_budget_cents: input.daily_budget_cents }
          : {}),
        ...(input.lifetime_budget_cents !== undefined
          ? { new_lifetime_budget_cents: input.lifetime_budget_cents }
          : {}),
        outcome: "live_success",
        meta_account_label: account.label,
      };
    } catch (err) {
      await ctx.auditLogger.log({
        tool: "meta.adsets.update_budget",
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
