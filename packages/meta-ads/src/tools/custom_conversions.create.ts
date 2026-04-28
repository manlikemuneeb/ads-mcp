import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { z } from "zod";
import { MetaClient } from "../MetaClient.js";
import { baseWriteInputShape } from "../schemas.js";

/**
 * Custom conversion: a derived conversion event that filters a pixel/CAPI
 * event stream by URL or event parameters. Maps to a standard event type
 * (PURCHASE, LEAD, etc.) so Meta's optimization can target it.
 */

const CustomEventType = z.enum([
  "ADD_PAYMENT_INFO",
  "ADD_TO_CART",
  "ADD_TO_WISHLIST",
  "COMPLETE_REGISTRATION",
  "CONTACT",
  "CONTENT_VIEW",
  "CUSTOMIZE_PRODUCT",
  "DONATE",
  "FIND_LOCATION",
  "INITIATED_CHECKOUT",
  "LEAD",
  "OTHER",
  "PURCHASE",
  "SCHEDULE",
  "SEARCH",
  "START_TRIAL",
  "SUBMIT_APPLICATION",
  "SUBSCRIBE",
]);

const Input = z.object({
  ...baseWriteInputShape,
  pixel_id: z
    .string()
    .min(1)
    .describe("Source pixel ID. Get from meta.pixels.list."),
  name: z.string().min(1),
  description: z.string().optional(),
  custom_event_type: CustomEventType.describe(
    "Standard event type this conversion maps to. Use OTHER if none fits.",
  ),
  rule: z
    .record(z.unknown())
    .describe(
      "Filter rule on URL or event parameters. Pass-through; see Meta's custom-conversions doc for grammar.",
    ),
  default_conversion_value: z
    .number()
    .nonnegative()
    .optional()
    .describe(
      "Default monetary value when the event payload doesn't carry one. Omit if not relevant.",
    ),
  // --- Source override (for non-pixel sources) -------------------------
  event_source_id: z
    .string()
    .optional()
    .describe(
      "Override the event source. Use when the conversion is derived from an Offline Event Set or App Events instead of pixel_id.",
    ),
  event_source_type: z
    .enum(["pixel", "app", "offline_conversion_data_set"])
    .optional()
    .describe(
      "Type of the event source. Defaults to 'pixel' (matching pixel_id). Use 'app' for mobile or 'offline_conversion_data_set' for offline events.",
    ),
  // --- Advanced rule grammar -----------------------------------------
  advanced_rule: z
    .record(z.unknown())
    .optional()
    .describe(
      "Alternative to rule that supports multi-event combinations and value aggregation. See Meta's custom-conversions advanced grammar.",
    ),
  rule_aggregation: z
    .enum(["count", "sum", "min", "max", "avg"])
    .optional()
    .describe(
      "Aggregation when the conversion is value-based (e.g. sum of purchase value above threshold).",
    ),
  // --- Escape hatch --------------------------------------------------
  additional_fields: z
    .record(z.unknown())
    .optional()
    .describe(
      "Any additional Meta-supported field (e.g. business, currency for value-based conversions). Merged verbatim.",
    ),
});
type Input = z.infer<typeof Input>;

export const tool: ToolDefinition<Input, unknown> = {
  name: "meta.custom_conversions.create",
  description:
    "Create a custom conversion on the ad account, derived from a pixel by URL/parameter rules and mapped to a standard event type. Dry-run by default.",
  platform: "meta",
  isWriteTool: true,
  inputSchema: Input,
  handler: async (input, ctx) => {
    const account = ctx.config.getAccount("meta", input.account);
    const decision = ctx.dryRunGate.evaluate({
      toolName: "meta.custom_conversions.create",
      platform: "meta",
      accountLabel: account.label,
      isWriteTool: true,
      ...(input.dry_run !== undefined ? { dryRunRequested: input.dry_run } : {}),
    });
    const client = new MetaClient(account, ctx.rateLimiter);
    const acctPath = client.getAccountPath();

    const body: Record<string, unknown> = {
      pixel_id: input.pixel_id,
      name: input.name,
      custom_event_type: input.custom_event_type,
      rule: input.rule,
    };
    if (input.description !== undefined) body.description = input.description;
    if (input.default_conversion_value !== undefined)
      body.default_conversion_value = input.default_conversion_value;
    if (input.event_source_id !== undefined) body.event_source_id = input.event_source_id;
    if (input.event_source_type !== undefined)
      body.event_source_type = input.event_source_type;
    if (input.advanced_rule !== undefined) body.advanced_rule = input.advanced_rule;
    if (input.rule_aggregation !== undefined)
      body.rule_aggregation = input.rule_aggregation;
    if (input.additional_fields !== undefined) Object.assign(body, input.additional_fields);

    const params = {
      pixel_id: input.pixel_id,
      name: input.name,
      custom_event_type: input.custom_event_type,
    };

    if (decision.outcome === "allow_dry_run") {
      await ctx.auditLogger.log({
        tool: "meta.custom_conversions.create",
        platform: "meta",
        account: account.label,
        params,
        dry_run: true,
        outcome: "allow_dry_run",
        result_summary: `would create custom conversion "${input.name}" (${input.custom_event_type}) on pixel ${input.pixel_id}`,
      });
      return {
        name: input.name,
        custom_event_type: input.custom_event_type,
        pixel_id: input.pixel_id,
        outcome: "allow_dry_run",
        meta_account_label: account.label,
      };
    }

    try {
      const result = (await client.post(`/${acctPath}/customconversions`, body)) as {
        id?: string;
      };
      await ctx.auditLogger.log({
        tool: "meta.custom_conversions.create",
        platform: "meta",
        account: account.label,
        params,
        dry_run: false,
        outcome: "live_success",
        result_summary: `created custom conversion ${result.id ?? "<no id>"} "${input.name}"`,
      });
      return {
        ...(result.id ? { custom_conversion_id: result.id } : {}),
        name: input.name,
        custom_event_type: input.custom_event_type,
        pixel_id: input.pixel_id,
        outcome: "live_success",
        meta_account_label: account.label,
      };
    } catch (err) {
      await ctx.auditLogger.log({
        tool: "meta.custom_conversions.create",
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
