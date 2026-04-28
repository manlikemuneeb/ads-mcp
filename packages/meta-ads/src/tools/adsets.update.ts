import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { z } from "zod";
import { MetaClient } from "../MetaClient.js";
import { baseWriteInputShape } from "../schemas.js";

const BidStrategy = z.enum([
  "LOWEST_COST_WITHOUT_CAP",
  "LOWEST_COST_WITH_BID_CAP",
  "COST_CAP",
  "LOWEST_COST_WITH_MIN_ROAS",
]);

const Input = z
  .object({
    ...baseWriteInputShape,
    adset_id: z.string().min(1),
    // Identity & state
    name: z.string().optional(),
    status: z.enum(["ACTIVE", "PAUSED", "ARCHIVED", "DELETED"]).optional(),
    // Budget & bidding
    daily_budget_cents: z.number().int().positive().optional(),
    lifetime_budget_cents: z.number().int().positive().optional(),
    bid_amount_cents: z.number().int().positive().optional(),
    bid_strategy: BidStrategy.optional(),
    bid_constraints: z.record(z.unknown()).optional(),
    minimum_roas_target_value: z.number().optional(),
    pacing_type: z.array(z.enum(["standard", "no_pacing"])).optional(),
    spend_cap_cents: z.number().int().positive().optional(),
    // Targeting & destination
    targeting: z.record(z.unknown()).optional(),
    promoted_object: z.record(z.unknown()).optional(),
    optimization_goal: z.string().optional(),
    optimization_sub_event: z.string().optional(),
    // Attribution & frequency
    attribution_spec: z.array(z.record(z.unknown())).optional(),
    frequency_control_specs: z.array(z.record(z.unknown())).optional(),
    // Conversion tracking
    conversion_specs: z.array(z.record(z.unknown())).optional(),
    tracking_specs: z.array(z.record(z.unknown())).optional(),
    // Scheduling
    start_time: z.string().optional(),
    end_time: z.string().optional(),
    adset_schedule: z.array(z.record(z.unknown())).optional(),
    // Organization
    adlabels: z.array(z.object({ name: z.string() })).optional(),
    // Escape hatch
    additional_fields: z.record(z.unknown()).optional(),
  })
  .refine(
    (v) =>
      v.name !== undefined ||
      v.status !== undefined ||
      v.daily_budget_cents !== undefined ||
      v.lifetime_budget_cents !== undefined ||
      v.bid_amount_cents !== undefined ||
      v.bid_strategy !== undefined ||
      v.bid_constraints !== undefined ||
      v.minimum_roas_target_value !== undefined ||
      v.pacing_type !== undefined ||
      v.spend_cap_cents !== undefined ||
      v.targeting !== undefined ||
      v.promoted_object !== undefined ||
      v.optimization_goal !== undefined ||
      v.optimization_sub_event !== undefined ||
      v.attribution_spec !== undefined ||
      v.frequency_control_specs !== undefined ||
      v.conversion_specs !== undefined ||
      v.tracking_specs !== undefined ||
      v.start_time !== undefined ||
      v.end_time !== undefined ||
      v.adset_schedule !== undefined ||
      v.adlabels !== undefined ||
      v.additional_fields !== undefined,
    { message: "At least one mutable field must be provided." },
  );
type Input = z.infer<typeof Input>;

export const tool: ToolDefinition<Input, unknown> = {
  name: "meta.adsets.update",
  description:
    "Update a Meta ad set's mutable fields: name, status, bid amount, targeting, schedule. Only changed fields are sent. Targeting passes through to Meta verbatim. Dry-run by default.",
  platform: "meta",
  isWriteTool: true,
  inputSchema: Input,
  handler: async (input, ctx) => {
    const account = ctx.config.getAccount("meta", input.account);
    const decision = ctx.dryRunGate.evaluate({
      toolName: "meta.adsets.update",
      platform: "meta",
      accountLabel: account.label,
      isWriteTool: true,
      ...(input.dry_run !== undefined ? { dryRunRequested: input.dry_run } : {}),
    });
    const client = new MetaClient(account, ctx.rateLimiter);

    let previous: Record<string, unknown> = {};
    try {
      previous = (await client.get(`/${input.adset_id}`, {
        fields: "name,status,bid_amount,start_time,end_time",
      })) as Record<string, unknown>;
    } catch {
      previous = {};
    }

    const body: Record<string, unknown> = {};
    if (input.name !== undefined) body.name = input.name;
    if (input.status !== undefined) body.status = input.status;
    if (input.daily_budget_cents !== undefined) body.daily_budget = input.daily_budget_cents;
    if (input.lifetime_budget_cents !== undefined)
      body.lifetime_budget = input.lifetime_budget_cents;
    if (input.bid_amount_cents !== undefined) body.bid_amount = input.bid_amount_cents;
    if (input.bid_strategy !== undefined) body.bid_strategy = input.bid_strategy;
    if (input.bid_constraints !== undefined) body.bid_constraints = input.bid_constraints;
    if (input.minimum_roas_target_value !== undefined)
      body.minimum_roas_target_value = input.minimum_roas_target_value;
    if (input.pacing_type !== undefined) body.pacing_type = input.pacing_type;
    if (input.spend_cap_cents !== undefined) body.spend_cap = input.spend_cap_cents;
    if (input.targeting !== undefined) body.targeting = input.targeting;
    if (input.promoted_object !== undefined)
      body.promoted_object = input.promoted_object;
    if (input.optimization_goal !== undefined)
      body.optimization_goal = input.optimization_goal;
    if (input.optimization_sub_event !== undefined)
      body.optimization_sub_event = input.optimization_sub_event;
    if (input.attribution_spec !== undefined)
      body.attribution_spec = input.attribution_spec;
    if (input.frequency_control_specs !== undefined)
      body.frequency_control_specs = input.frequency_control_specs;
    if (input.conversion_specs !== undefined) body.conversion_specs = input.conversion_specs;
    if (input.tracking_specs !== undefined) body.tracking_specs = input.tracking_specs;
    if (input.start_time !== undefined) body.start_time = input.start_time;
    if (input.end_time !== undefined) body.end_time = input.end_time;
    if (input.adset_schedule !== undefined) body.adset_schedule = input.adset_schedule;
    if (input.adlabels !== undefined) body.adlabels = input.adlabels;
    if (input.additional_fields !== undefined) Object.assign(body, input.additional_fields);

    const params: Record<string, unknown> = { adset_id: input.adset_id, ...body };

    if (decision.outcome === "allow_dry_run") {
      await ctx.auditLogger.log({
        tool: "meta.adsets.update",
        platform: "meta",
        account: account.label,
        params,
        dry_run: true,
        outcome: "allow_dry_run",
        result_summary: `would update ad set ${input.adset_id}`,
      });
      return {
        adset_id: input.adset_id,
        previous,
        changes: body,
        outcome: "allow_dry_run",
        meta_account_label: account.label,
      };
    }

    try {
      await client.post(`/${input.adset_id}`, body);
      await ctx.auditLogger.log({
        tool: "meta.adsets.update",
        platform: "meta",
        account: account.label,
        params,
        dry_run: false,
        outcome: "live_success",
        result_summary: `updated ad set ${input.adset_id}`,
      });
      return {
        adset_id: input.adset_id,
        previous,
        changes: body,
        outcome: "live_success",
        meta_account_label: account.label,
      };
    } catch (err) {
      await ctx.auditLogger.log({
        tool: "meta.adsets.update",
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
