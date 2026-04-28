import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { z } from "zod";
import { MetaClient } from "../MetaClient.js";
import { baseWriteInputShape } from "../schemas.js";

const SpecialAdCategoryArr = z.array(
  z.enum([
    "NONE",
    "EMPLOYMENT",
    "HOUSING",
    "CREDIT",
    "ISSUES_ELECTIONS_POLITICS",
    "ONLINE_GAMBLING_AND_GAMING",
    "FINANCIAL_PRODUCTS_SERVICES",
  ]),
);

const BidStrategy = z.enum([
  "LOWEST_COST_WITHOUT_CAP",
  "LOWEST_COST_WITH_BID_CAP",
  "COST_CAP",
  "LOWEST_COST_WITH_MIN_ROAS",
]);

const Input = z
  .object({
    ...baseWriteInputShape,
    campaign_id: z.string().min(1),
    // Identity
    name: z.string().optional(),
    status: z.enum(["ACTIVE", "PAUSED", "ARCHIVED", "DELETED"]).optional(),
    special_ad_categories: SpecialAdCategoryArr.optional(),
    // Budget & bidding
    daily_budget_cents: z.number().int().positive().optional(),
    lifetime_budget_cents: z.number().int().positive().optional(),
    spend_cap_cents: z.number().int().positive().optional(),
    bid_strategy: BidStrategy.optional(),
    budget_rebalance_flag: z.boolean().optional(),
    // Scheduling
    start_time: z.string().optional(),
    stop_time: z.string().optional(),
    // Promoted object (only meaningful for some objectives)
    promoted_object: z.record(z.unknown()).optional(),
    // Organization
    adlabels: z.array(z.object({ name: z.string() })).optional(),
    // Escape hatch for any field not yet named explicitly
    additional_fields: z
      .record(z.unknown())
      .optional()
      .describe(
        "Any additional Meta-supported field not listed above. Merged into the PATCH body verbatim.",
      ),
  })
  .refine(
    (v) =>
      v.name !== undefined ||
      v.status !== undefined ||
      v.special_ad_categories !== undefined ||
      v.daily_budget_cents !== undefined ||
      v.lifetime_budget_cents !== undefined ||
      v.spend_cap_cents !== undefined ||
      v.bid_strategy !== undefined ||
      v.budget_rebalance_flag !== undefined ||
      v.start_time !== undefined ||
      v.stop_time !== undefined ||
      v.promoted_object !== undefined ||
      v.adlabels !== undefined ||
      v.additional_fields !== undefined,
    {
      message:
        "At least one mutable field must be provided.",
    },
  );
type Input = z.infer<typeof Input>;

export const tool: ToolDefinition<Input, unknown> = {
  name: "meta.campaigns.update",
  description:
    "Update a Meta campaign's mutable fields: name, status, or special_ad_categories. Only changed fields are sent. Dry-run by default.",
  platform: "meta",
  isWriteTool: true,
  inputSchema: Input,
  handler: async (input, ctx) => {
    const account = ctx.config.getAccount("meta", input.account);
    const decision = ctx.dryRunGate.evaluate({
      toolName: "meta.campaigns.update",
      platform: "meta",
      accountLabel: account.label,
      isWriteTool: true,
      ...(input.dry_run !== undefined ? { dryRunRequested: input.dry_run } : {}),
    });
    const client = new MetaClient(account, ctx.rateLimiter);

    let previous: Record<string, unknown> = {};
    try {
      previous = (await client.get(`/${input.campaign_id}`, {
        fields: "name,status,special_ad_categories",
      })) as Record<string, unknown>;
    } catch {
      previous = {};
    }

    const body: Record<string, unknown> = {};
    if (input.name !== undefined) body.name = input.name;
    if (input.status !== undefined) body.status = input.status;
    if (input.special_ad_categories !== undefined)
      body.special_ad_categories = input.special_ad_categories;
    if (input.daily_budget_cents !== undefined)
      body.daily_budget = input.daily_budget_cents;
    if (input.lifetime_budget_cents !== undefined)
      body.lifetime_budget = input.lifetime_budget_cents;
    if (input.spend_cap_cents !== undefined) body.spend_cap = input.spend_cap_cents;
    if (input.bid_strategy !== undefined) body.bid_strategy = input.bid_strategy;
    if (input.budget_rebalance_flag !== undefined)
      body.budget_rebalance_flag = input.budget_rebalance_flag;
    if (input.start_time !== undefined) body.start_time = input.start_time;
    if (input.stop_time !== undefined) body.stop_time = input.stop_time;
    if (input.promoted_object !== undefined)
      body.promoted_object = input.promoted_object;
    if (input.adlabels !== undefined) body.adlabels = input.adlabels;
    if (input.additional_fields !== undefined) {
      Object.assign(body, input.additional_fields);
    }

    // The audit-log payload mirrors what was changed; we record every
    // explicit field so the log is meaningful when the user wants to know
    // what they ran six months ago.
    const params: Record<string, unknown> = { campaign_id: input.campaign_id, ...body };

    if (decision.outcome === "allow_dry_run") {
      await ctx.auditLogger.log({
        tool: "meta.campaigns.update",
        platform: "meta",
        account: account.label,
        params,
        dry_run: true,
        outcome: "allow_dry_run",
        result_summary: `would update campaign ${input.campaign_id}`,
      });
      return {
        campaign_id: input.campaign_id,
        previous,
        changes: body,
        outcome: "allow_dry_run",
        meta_account_label: account.label,
      };
    }

    try {
      await client.post(`/${input.campaign_id}`, body);
      await ctx.auditLogger.log({
        tool: "meta.campaigns.update",
        platform: "meta",
        account: account.label,
        params,
        dry_run: false,
        outcome: "live_success",
        result_summary: `updated campaign ${input.campaign_id}`,
      });
      return {
        campaign_id: input.campaign_id,
        previous,
        changes: body,
        outcome: "live_success",
        meta_account_label: account.label,
      };
    } catch (err) {
      await ctx.auditLogger.log({
        tool: "meta.campaigns.update",
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
