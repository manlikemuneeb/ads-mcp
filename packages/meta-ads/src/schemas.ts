import { z } from "zod";

/** Time presets accepted by Meta Insights API. */
export const DatePreset = z
  .enum([
    "today",
    "yesterday",
    "this_month",
    "last_month",
    "last_7d",
    "last_14d",
    "last_28d",
    "last_30d",
    "last_90d",
    "this_year",
    "last_year",
  ])
  .default("last_30d");

/** Optional account label, defaults to platform default_account. */
export const AccountLabel = z.string().min(1).optional();

/** Standard preamble used by every tool. */
export const baseInputShape = {
  account: AccountLabel.describe("Account label from config. Omit for default."),
};

/** Standard preamble for write tools. */
export const baseWriteInputShape = {
  ...baseInputShape,
  dry_run: z
    .boolean()
    .optional()
    .describe(
      "If true, validates and simulates the call without mutating. Defaults to config.default_dry_run (true on first install).",
    ),
};

/**
 * Common fields every insights tool accepts. Tools layer their own
 * `fields` and tool-specific breakdowns on top.
 */
export const insightsCommonShape = {
  date_preset: DatePreset.describe(
    "Predefined window. Mutually informational with time_range; if time_range is set it overrides date_preset on Meta's side.",
  ),
  time_range: z
    .object({
      since: z.string().describe("YYYY-MM-DD"),
      until: z.string().describe("YYYY-MM-DD"),
    })
    .optional()
    .describe(
      "Custom date window. Overrides date_preset when set. Format: { since: '2026-01-01', until: '2026-03-31' }.",
    ),
  time_increment: z
    .union([
      z.enum(["1", "7", "28", "monthly", "all_days"]),
      z.number().int().positive(),
    ])
    .optional()
    .describe(
      "Group results by time bucket: '1' = daily rows, '7' = weekly, '28' = 4-weekly, 'monthly' = calendar month, 'all_days' = single roll-up. Numeric N values bucket by N days.",
    ),
  filtering: z
    .array(
      z.object({
        field: z.string(),
        operator: z.enum([
          "EQUAL",
          "NOT_EQUAL",
          "GREATER_THAN",
          "GREATER_THAN_OR_EQUAL",
          "LESS_THAN",
          "LESS_THAN_OR_EQUAL",
          "IN_RANGE",
          "NOT_IN_RANGE",
          "CONTAIN",
          "NOT_CONTAIN",
          "IN",
          "NOT_IN",
          "ANY",
          "ALL",
          "NONE",
        ]),
        value: z.unknown(),
      }),
    )
    .optional()
    .describe(
      "Custom filters. Example: [{field:'spend', operator:'GREATER_THAN', value:100}, {field:'campaign.name', operator:'CONTAIN', value:'Q1'}].",
    ),
  action_breakdowns: z
    .array(
      z.enum([
        "action_type",
        "action_target_id",
        "action_destination",
        "action_device",
        "action_carousel_card_id",
        "action_carousel_card_name",
        "action_canvas_component_id",
        "action_canvas_component_name",
        "action_converted_product_id",
        "action_video_sound",
        "action_video_type",
        "action_reaction",
      ]),
    )
    .optional()
    .describe(
      "How action-type metrics are broken down further. action_type is the most common; the rest are advanced.",
    ),
  action_attribution_windows: z
    .array(
      z.enum([
        "1d_view",
        "7d_view",
        "28d_view",
        "1d_click",
        "7d_click",
        "28d_click",
        "1d_ev",
      ]),
    )
    .optional()
    .describe(
      "Override attribution windows for this report. Defaults to the account setting.",
    ),
  level: z
    .enum(["account", "campaign", "adset", "ad"])
    .optional()
    .describe(
      "Aggregation level. Defaults to whichever level the parent ID points at.",
    ),
  limit: z
    .number()
    .int()
    .positive()
    .max(500)
    .optional()
    .describe("Max rows per page; Meta caps at 500."),
  after: z
    .string()
    .optional()
    .describe("Pagination cursor from a prior response."),
  sort: z
    .array(z.string())
    .optional()
    .describe(
      "Server-side sort. Each entry is `field_descending` or `field_ascending` (e.g. 'spend_descending').",
    ),
  use_account_attribution_setting: z
    .boolean()
    .optional()
    .describe(
      "When true, uses the account's saved attribution setting and ignores action_attribution_windows.",
    ),
  use_unified_attribution_setting: z
    .boolean()
    .optional()
    .describe(
      "When true, applies the unified ads attribution model (post-iOS 14.5 default).",
    ),
  additional_fields: z
    .record(z.unknown())
    .optional()
    .describe(
      "Any additional Meta-supported insights param (e.g. export_format, export_columns, export_name, summary, summary_action_breakdowns). Merged into the request query verbatim.",
    ),
};

/**
 * Helper: assemble a Meta /insights query string from the common shape.
 * Returns an object suitable for `client.get(path, query)`.
 */
export function buildInsightsQuery(input: {
  date_preset?: string | undefined;
  time_range?: { since: string; until: string } | undefined;
  time_increment?: string | number | undefined;
  filtering?: unknown[] | undefined;
  action_breakdowns?: string[] | undefined;
  action_attribution_windows?: string[] | undefined;
  level?: string | undefined;
  limit?: number | undefined;
  after?: string | undefined;
  sort?: string[] | undefined;
  use_account_attribution_setting?: boolean | undefined;
  use_unified_attribution_setting?: boolean | undefined;
  additional_fields?: Record<string, unknown> | undefined;
}): Record<string, string | number | undefined> {
  const q: Record<string, string | number | undefined> = {};
  // time_range overrides date_preset when both are set.
  if (input.time_range !== undefined) {
    q.time_range = JSON.stringify(input.time_range);
  } else if (input.date_preset !== undefined) {
    q.date_preset = input.date_preset;
  }
  if (input.time_increment !== undefined) q.time_increment = String(input.time_increment);
  if (input.filtering !== undefined) q.filtering = JSON.stringify(input.filtering);
  if (input.action_breakdowns !== undefined)
    q.action_breakdowns = input.action_breakdowns.join(",");
  if (input.action_attribution_windows !== undefined)
    q.action_attribution_windows = JSON.stringify(input.action_attribution_windows);
  if (input.level !== undefined) q.level = input.level;
  if (input.limit !== undefined) q.limit = input.limit;
  if (input.after !== undefined) q.after = input.after;
  if (input.sort !== undefined) q.sort = input.sort.join(",");
  if (input.use_account_attribution_setting !== undefined)
    q.use_account_attribution_setting = String(input.use_account_attribution_setting);
  if (input.use_unified_attribution_setting !== undefined)
    q.use_unified_attribution_setting = String(input.use_unified_attribution_setting);
  if (input.additional_fields !== undefined) {
    for (const [k, v] of Object.entries(input.additional_fields)) {
      q[k] =
        typeof v === "string" || typeof v === "number" || v === undefined
          ? (v as string | number | undefined)
          : JSON.stringify(v);
    }
  }
  return q;
}
