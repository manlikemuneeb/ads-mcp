import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { z } from "zod";
import { MetaClient } from "../MetaClient.js";
import { baseWriteInputShape } from "../schemas.js";

/**
 * Meta ad set creation. The targeting object's full schema (interests,
 * geo, behaviors, custom audiences, demographics, etc.) is intentionally
 * accepted as `z.record(z.unknown())` because the targeting taxonomy is
 * vast and rapidly evolving — modeling it in Zod would either constrain
 * users to a stale subset or balloon this file. Instead we trust the
 * caller to pass a valid Meta targeting payload and rely on the API to
 * reject malformed shapes.
 *
 * Field reference:
 *   https://developers.facebook.com/docs/marketing-api/reference/ad-campaign
 *   https://developers.facebook.com/docs/marketing-api/audiences/reference/targeting-specs
 */

const BillingEvent = z.enum([
  "IMPRESSIONS",
  "LINK_CLICKS",
  "PAGE_LIKES",
  "POST_ENGAGEMENT",
  "VIDEO_VIEWS",
  "THRUPLAY",
  "APP_INSTALLS",
  "PURCHASES",
  "LISTING_INTERACTION",
]);

const OptimizationGoal = z.enum([
  "REACH",
  "IMPRESSIONS",
  "LINK_CLICKS",
  "OFFSITE_CONVERSIONS",
  "POST_ENGAGEMENT",
  "VIDEO_VIEWS",
  "LEAD_GENERATION",
  "QUALITY_LEAD",
  "QUALITY_CALL",
  "LANDING_PAGE_VIEWS",
  "VALUE",
  "APP_INSTALLS",
  "APP_INSTALLS_AND_OFFSITE_CONVERSIONS",
  "AD_RECALL_LIFT",
  "ENGAGED_USERS",
  "EVENT_RESPONSES",
  "MEANINGFUL_CALL_ATTEMPT",
  "PROFILE_VISIT",
  "REPLIES",
  "DERIVED_EVENTS",
  "SUBSCRIBERS",
  "VISIT_INSTAGRAM_PROFILE",
  "CONVERSATIONS",
]);

const BidStrategy = z.enum([
  "LOWEST_COST_WITHOUT_CAP",
  "LOWEST_COST_WITH_BID_CAP",
  "COST_CAP",
  "LOWEST_COST_WITH_MIN_ROAS",
]);

const PacingType = z.enum(["standard", "no_pacing"]);

const DestinationType = z.enum([
  "WEBSITE",
  "APP",
  "MESSENGER",
  "INSTAGRAM_DIRECT",
  "ON_AD",
  "ON_POST",
  "ON_PAGE",
  "ON_VIDEO",
  "ON_EVENT",
  "SHOP_AUTOMATIC",
  "FACEBOOK",
  "WHATSAPP",
  "INSTAGRAM_PROFILE",
  "INSTAGRAM_PROFILE_AND_DIRECT",
  "PHONE_CALL",
]);

const Input = z
  .object({
    ...baseWriteInputShape,
    campaign_id: z.string().min(1).describe("Parent campaign ID."),
    name: z.string().min(1),
    status: z.enum(["ACTIVE", "PAUSED"]).default("PAUSED"),
    // --- Budget & bidding -------------------------------------------------
    daily_budget_cents: z.number().int().positive().optional(),
    lifetime_budget_cents: z.number().int().positive().optional(),
    bid_amount_cents: z
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        "Optional bid in account-currency cents. Required when bid_strategy is LOWEST_COST_WITH_BID_CAP or COST_CAP. Omit for auto-bidding.",
      ),
    bid_strategy: BidStrategy.optional().describe(
      "Overrides the campaign's bid strategy at the ad-set level.",
    ),
    bid_constraints: z
      .record(z.unknown())
      .optional()
      .describe(
        "Per-event bid caps. Pass-through, e.g. { roas_average_floor: 50000 } for ROAS floors.",
      ),
    minimum_roas_target_value: z
      .number()
      .optional()
      .describe(
        "Required when bid_strategy is LOWEST_COST_WITH_MIN_ROAS. Decimal target ROAS (e.g. 1.5 = 150% return).",
      ),
    pacing_type: z
      .array(PacingType)
      .optional()
      .describe("Defaults to ['standard']. Use ['no_pacing'] to spend as fast as possible."),
    spend_cap_cents: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Hard cap on total spend for this ad set."),
    billing_event: BillingEvent.describe(
      "What Meta charges you for. IMPRESSIONS is the default for most campaigns.",
    ),
    optimization_goal: OptimizationGoal.describe(
      "What Meta's delivery system optimizes toward.",
    ),
    optimization_sub_event: z
      .string()
      .optional()
      .describe(
        "When optimization_goal is OFFSITE_CONVERSIONS, the specific custom event to optimize for (e.g. PURCHASE, LEAD).",
      ),
    // --- Targeting & destination -----------------------------------------
    targeting: z
      .record(z.unknown())
      .describe(
        "Meta targeting payload. Full taxonomy: https://developers.facebook.com/docs/marketing-api/audiences/reference/targeting-specs",
      ),
    destination_type: DestinationType.optional().describe(
      "Destination of the ad. Defaults are inferred from optimization_goal but explicit values give Meta a clearer signal.",
    ),
    promoted_object: z
      .record(z.unknown())
      .optional()
      .describe(
        "Required for OFFSITE_CONVERSIONS ({pixel_id, custom_event_type}), LEAD_GENERATION ({page_id}), app installs ({application_id, object_store_url}), and ROAS bidding ({pixel_id, custom_conversion_id}). Pass-through to Meta.",
      ),
    // --- Attribution & frequency -----------------------------------------
    attribution_spec: z
      .array(z.record(z.unknown()))
      .optional()
      .describe(
        "Attribution windows for measurement. Default uses the account setting. Example: [{event_type: 'CLICK_THROUGH', window_days: 7}].",
      ),
    frequency_control_specs: z
      .array(z.record(z.unknown()))
      .optional()
      .describe(
        "Frequency caps for reach campaigns. Example: [{event: 'IMPRESSIONS', interval_days: 7, max_frequency: 3}].",
      ),
    // --- Conversion tracking --------------------------------------------
    conversion_specs: z
      .array(z.record(z.unknown()))
      .optional()
      .describe(
        "Specific conversion events to track for this ad set. Pass-through.",
      ),
    tracking_specs: z
      .array(z.record(z.unknown()))
      .optional()
      .describe("Pixel/app event tracking. Inherited from ads.create surface."),
    // --- Scheduling -----------------------------------------------------
    start_time: z
      .string()
      .optional()
      .describe("ISO 8601, e.g. 2026-05-01T00:00:00-0700. Omit to start immediately."),
    end_time: z
      .string()
      .optional()
      .describe(
        "ISO 8601 end time. Required when lifetime_budget_cents is set; optional with daily_budget_cents.",
      ),
    adset_schedule: z
      .array(z.record(z.unknown()))
      .optional()
      .describe(
        "Dayparting: array of {start_minute, end_minute, days, timezone_type}. Example: [{start_minute: 540, end_minute: 1080, days: [1,2,3,4,5], timezone_type: 'USER'}] = 9-6pm Mon-Fri user-local.",
      ),
    // --- Organization ---------------------------------------------------
    adlabels: z.array(z.object({ name: z.string() })).optional(),
    // --- Escape hatch ---------------------------------------------------
    additional_fields: z
      .record(z.unknown())
      .optional()
      .describe(
        "Any additional Meta-supported field (e.g. dsa_payor, dsa_beneficiary, multi_optimization_goal_weight, asset_feed_id, source_adset_id). Merged into the request body verbatim.",
      ),
  })
  .refine(
    (v) => (v.daily_budget_cents !== undefined) !== (v.lifetime_budget_cents !== undefined),
    { message: "Pass exactly one of daily_budget_cents or lifetime_budget_cents." },
  );
type Input = z.infer<typeof Input>;

export const tool: ToolDefinition<Input, unknown> = {
  name: "meta.adsets.create",
  description:
    "Create a Meta ad set under a campaign with targeting, budget, schedule, billing event, and optimization goal. Defaults to status=PAUSED. Dry-run by default. The targeting object is passed through to Meta verbatim — see Meta's targeting-specs doc for the schema.",
  platform: "meta",
  isWriteTool: true,
  inputSchema: Input,
  handler: async (input, ctx) => {
    const account = ctx.config.getAccount("meta", input.account);
    const decision = ctx.dryRunGate.evaluate({
      toolName: "meta.adsets.create",
      platform: "meta",
      accountLabel: account.label,
      isWriteTool: true,
      ...(input.dry_run !== undefined ? { dryRunRequested: input.dry_run } : {}),
    });
    const client = new MetaClient(account, ctx.rateLimiter);
    const acctPath = client.getAccountPath();

    const body: Record<string, unknown> = {
      campaign_id: input.campaign_id,
      name: input.name,
      status: input.status,
      billing_event: input.billing_event,
      optimization_goal: input.optimization_goal,
      targeting: input.targeting,
    };
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
    if (input.optimization_sub_event !== undefined)
      body.optimization_sub_event = input.optimization_sub_event;
    if (input.destination_type !== undefined)
      body.destination_type = input.destination_type;
    if (input.promoted_object !== undefined)
      body.promoted_object = input.promoted_object;
    if (input.attribution_spec !== undefined)
      body.attribution_spec = input.attribution_spec;
    if (input.frequency_control_specs !== undefined)
      body.frequency_control_specs = input.frequency_control_specs;
    if (input.conversion_specs !== undefined)
      body.conversion_specs = input.conversion_specs;
    if (input.tracking_specs !== undefined) body.tracking_specs = input.tracking_specs;
    if (input.start_time !== undefined) body.start_time = input.start_time;
    if (input.end_time !== undefined) body.end_time = input.end_time;
    if (input.adset_schedule !== undefined) body.adset_schedule = input.adset_schedule;
    if (input.adlabels !== undefined) body.adlabels = input.adlabels;
    if (input.additional_fields !== undefined) Object.assign(body, input.additional_fields);

    const params = {
      campaign_id: input.campaign_id,
      name: input.name,
      status: input.status,
      billing_event: input.billing_event,
      optimization_goal: input.optimization_goal,
    };

    if (decision.outcome === "allow_dry_run") {
      await ctx.auditLogger.log({
        tool: "meta.adsets.create",
        platform: "meta",
        account: account.label,
        params,
        dry_run: true,
        outcome: "allow_dry_run",
        result_summary: `would create ad set "${input.name}" under campaign ${input.campaign_id}`,
      });
      return {
        name: input.name,
        campaign_id: input.campaign_id,
        status: input.status,
        outcome: "allow_dry_run",
        meta_account_label: account.label,
      };
    }

    try {
      const result = (await client.post(`/${acctPath}/adsets`, body)) as { id?: string };
      await ctx.auditLogger.log({
        tool: "meta.adsets.create",
        platform: "meta",
        account: account.label,
        params,
        dry_run: false,
        outcome: "live_success",
        result_summary: `created ad set ${result.id ?? "<no id>"} "${input.name}"`,
      });
      return {
        ...(result.id ? { adset_id: result.id } : {}),
        name: input.name,
        campaign_id: input.campaign_id,
        status: input.status,
        outcome: "live_success",
        meta_account_label: account.label,
      };
    } catch (err) {
      await ctx.auditLogger.log({
        tool: "meta.adsets.create",
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
