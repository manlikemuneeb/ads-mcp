import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { z } from "zod";
import { MetaClient } from "../MetaClient.js";
import { baseWriteInputShape } from "../schemas.js";

/**
 * Meta campaign objectives — the canonical list per Marketing API v25.0.
 * Source: https://developers.facebook.com/docs/marketing-api/reference/ad-campaign-group#fields
 *
 * The legacy objective values (CONVERSIONS, LINK_CLICKS, etc.) were retired
 * in v18.0 in favor of the OUTCOME_ family. We only accept the new values.
 */
const Objective = z.enum([
  "OUTCOME_AWARENESS",
  "OUTCOME_TRAFFIC",
  "OUTCOME_ENGAGEMENT",
  "OUTCOME_LEADS",
  "OUTCOME_APP_PROMOTION",
  "OUTCOME_SALES",
]);

const SpecialAdCategory = z.enum([
  "NONE",
  "EMPLOYMENT",
  "HOUSING",
  "CREDIT",
  "ISSUES_ELECTIONS_POLITICS",
  "ONLINE_GAMBLING_AND_GAMING",
  "FINANCIAL_PRODUCTS_SERVICES",
]);

const BidStrategy = z
  .enum([
    "LOWEST_COST_WITHOUT_CAP",
    "LOWEST_COST_WITH_BID_CAP",
    "COST_CAP",
    "LOWEST_COST_WITH_MIN_ROAS",
  ])
  .describe(
    "How Meta paces bids. LOWEST_COST_WITHOUT_CAP is auto-bidding (default). _WITH_BID_CAP and COST_CAP need bid_cap on the ad set. _WITH_MIN_ROAS needs minimum_roas_target_value on the ad set.",
  );

const Input = z.object({
  ...baseWriteInputShape,
  name: z.string().min(1).describe("Display name for the campaign."),
  objective: Objective.describe(
    "Campaign objective. Use OUTCOME_* values; legacy objectives were retired in API v18.0.",
  ),
  status: z
    .enum(["ACTIVE", "PAUSED"])
    .default("PAUSED")
    .describe(
      "Initial status. Defaults to PAUSED so newly-created campaigns don't start spending until you explicitly activate them.",
    ),
  special_ad_categories: z
    .array(SpecialAdCategory)
    .default([])
    .describe(
      "Special ad category designation. Required for housing/employment/credit/political ads; pass [] for unrestricted ads.",
    ),
  buying_type: z
    .enum(["AUCTION", "RESERVED"])
    .optional()
    .describe(
      "Defaults to AUCTION; set RESERVED for reach-and-frequency campaigns.",
    ),
  // --- Budget & bidding ----------------------------------------------------
  daily_budget_cents: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      "Campaign-level daily budget in account-currency cents. Mutually exclusive with lifetime_budget_cents. Set this OR define ad-set-level budgets later.",
    ),
  lifetime_budget_cents: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      "Campaign-level lifetime budget. Requires stop_time. Mutually exclusive with daily_budget_cents.",
    ),
  spend_cap_cents: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      "Optional hard cap on lifetime spend, regardless of budget. Acts as a kill-switch.",
    ),
  bid_strategy: BidStrategy.optional(),
  budget_rebalance_flag: z
    .boolean()
    .optional()
    .describe(
      "Legacy CBO toggle. Most modern campaigns use Advantage Campaign Budget which Meta sets automatically.",
    ),
  // --- Scheduling ----------------------------------------------------------
  start_time: z
    .string()
    .optional()
    .describe("ISO 8601, e.g. 2026-05-01T00:00:00-0700. Omit to start immediately."),
  stop_time: z
    .string()
    .optional()
    .describe(
      "ISO 8601 stop time. Required when lifetime_budget_cents is set; optional otherwise.",
    ),
  // --- Promoted object (required for some objectives) ----------------------
  promoted_object: z
    .record(z.unknown())
    .optional()
    .describe(
      "Required for OUTCOME_SALES with product catalogs ({product_set_id}), OUTCOME_LEADS to a specific page ({page_id}), and app-promotion campaigns ({application_id, object_store_url}). Pass-through to Meta.",
    ),
  // --- Organization --------------------------------------------------------
  adlabels: z
    .array(z.object({ name: z.string() }))
    .optional()
    .describe(
      "Optional ad labels for filtering and reporting. Each label: { name: 'My Label' }.",
    ),
  // --- Escape hatch --------------------------------------------------------
  additional_fields: z
    .record(z.unknown())
    .optional()
    .describe(
      "Any additional Meta-supported field not listed above (e.g. iterative_split_test_configs, topline_id, can_use_spend_cap, source_campaign_id). Merged into the request body verbatim. Use this instead of meta.passthrough.write so you keep the named-tool audit log.",
    ),
});
type Input = z.infer<typeof Input>;

interface Output {
  campaign_id?: string;
  name: string;
  objective: string;
  status: "ACTIVE" | "PAUSED";
  outcome: "allow_dry_run" | "live_success" | "live_failure";
  meta_account_label: string;
}

export const tool: ToolDefinition<Input, Output> = {
  name: "meta.campaigns.create",
  description:
    "Create a new Meta ad campaign. Defaults to status=PAUSED so it does not begin spending until explicitly activated. Dry-run by default; high-risk write that creates billable infrastructure.",
  platform: "meta",
  isWriteTool: true,
  inputSchema: Input,
  handler: async (input, ctx) => {
    const account = ctx.config.getAccount("meta", input.account);
    const decision = ctx.dryRunGate.evaluate({
      toolName: "meta.campaigns.create",
      platform: "meta",
      accountLabel: account.label,
      isWriteTool: true,
      ...(input.dry_run !== undefined ? { dryRunRequested: input.dry_run } : {}),
    });

    const client = new MetaClient(account, ctx.rateLimiter);
    const acctPath = client.getAccountPath();

    const body: Record<string, unknown> = {
      name: input.name,
      objective: input.objective,
      status: input.status,
      special_ad_categories: input.special_ad_categories,
    };
    if (input.buying_type) body.buying_type = input.buying_type;
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

    // params is the audit-log payload; mirror the body but keep it concise.
    const params: Record<string, unknown> = {
      name: input.name,
      objective: input.objective,
      status: input.status,
      special_ad_categories: input.special_ad_categories,
      ...(input.buying_type ? { buying_type: input.buying_type } : {}),
      ...(input.daily_budget_cents !== undefined
        ? { daily_budget_cents: input.daily_budget_cents }
        : {}),
      ...(input.lifetime_budget_cents !== undefined
        ? { lifetime_budget_cents: input.lifetime_budget_cents }
        : {}),
      ...(input.spend_cap_cents !== undefined
        ? { spend_cap_cents: input.spend_cap_cents }
        : {}),
      ...(input.bid_strategy ? { bid_strategy: input.bid_strategy } : {}),
      ...(input.start_time ? { start_time: input.start_time } : {}),
      ...(input.stop_time ? { stop_time: input.stop_time } : {}),
    };

    if (decision.outcome === "allow_dry_run") {
      await ctx.auditLogger.log({
        tool: "meta.campaigns.create",
        platform: "meta",
        account: account.label,
        params,
        dry_run: true,
        outcome: "allow_dry_run",
        result_summary: `would create campaign "${input.name}" (objective ${input.objective}, status ${input.status})`,
      });
      return {
        name: input.name,
        objective: input.objective,
        status: input.status,
        outcome: "allow_dry_run",
        meta_account_label: account.label,
      };
    }

    try {
      const result = (await client.post(`/${acctPath}/campaigns`, body)) as {
        id?: string;
      };
      const campaignId = result.id;
      await ctx.auditLogger.log({
        tool: "meta.campaigns.create",
        platform: "meta",
        account: account.label,
        params,
        dry_run: false,
        outcome: "live_success",
        result_summary: `created campaign ${campaignId ?? "<no id returned>"} "${input.name}"`,
      });
      return {
        ...(campaignId ? { campaign_id: campaignId } : {}),
        name: input.name,
        objective: input.objective,
        status: input.status,
        outcome: "live_success",
        meta_account_label: account.label,
      };
    } catch (err) {
      await ctx.auditLogger.log({
        tool: "meta.campaigns.create",
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
