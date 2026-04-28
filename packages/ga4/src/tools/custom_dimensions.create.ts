import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { z } from "zod";
import { Ga4Client } from "../Ga4Client.js";
import { baseWriteInputShape } from "../schemas.js";
import { audit } from "./_writeUtils.js";

/**
 * GA4 Admin API:
 *   POST /v1beta/properties/{id}/customDimensions
 * docs: https://developers.google.com/analytics/devguides/config/admin/v1/rest/v1beta/properties.customDimensions/create
 */
const Input = z.object({
  ...baseWriteInputShape,
  parameter_name: z
    .string()
    .min(1)
    .describe("Tag/event parameter name this dimension is sourced from (e.g. 'plan_tier')."),
  display_name: z
    .string()
    .min(1)
    .describe("Human-readable name shown in GA4 reports."),
  description: z.string().optional(),
  scope: z
    .enum(["EVENT", "USER", "ITEM"])
    .default("EVENT")
    .describe(
      "Dimension scope. EVENT (most common) tags a single event; USER persists across the user's lifetime; ITEM is for ecommerce items.",
    ),
  disallow_ads_personalization: z
    .boolean()
    .optional()
    .describe(
      "When true, the dimension is excluded from ads personalization use. Recommended for PII-adjacent values.",
    ),
});
type Input = z.infer<typeof Input>;

export const tool: ToolDefinition<Input, unknown> = {
  name: "ga4.custom_dimensions.create",
  description:
    "Create a custom dimension on a GA4 property. Required fields: parameter_name (the tag/event param to source from) and display_name. Defaults scope to EVENT. Dry-run by default.",
  platform: "ga4",
  isWriteTool: true,
  inputSchema: Input,
  handler: async (input, ctx) => {
    const property = ctx.config.getAccount("ga4", input.account);
    const decision = ctx.dryRunGate.evaluate({
      toolName: "ga4.custom_dimensions.create",
      platform: "ga4",
      accountLabel: property.label,
      isWriteTool: true,
      ...(input.dry_run !== undefined ? { dryRunRequested: input.dry_run } : {}),
    });
    const client = new Ga4Client(property, ctx.rateLimiter);

    const body: Record<string, unknown> = {
      parameterName: input.parameter_name,
      displayName: input.display_name,
      scope: input.scope,
    };
    if (input.description !== undefined) body.description = input.description;
    if (input.disallow_ads_personalization !== undefined) {
      body.disallowAdsPersonalization = input.disallow_ads_personalization;
    }

    const params: Record<string, unknown> = {
      parameter_name: input.parameter_name,
      display_name: input.display_name,
      scope: input.scope,
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.disallow_ads_personalization !== undefined
        ? { disallow_ads_personalization: input.disallow_ads_personalization }
        : {}),
    };

    if (decision.outcome === "allow_dry_run") {
      await audit(ctx, {
        tool: "ga4.custom_dimensions.create",
        account: property.label,
        params,
        dryRun: true,
        outcome: "allow_dry_run",
        resultSummary: `would create custom dimension "${input.display_name}" (scope ${input.scope}) from parameter ${input.parameter_name}`,
      });
      return {
        parameter_name: input.parameter_name,
        display_name: input.display_name,
        scope: input.scope,
        outcome: "allow_dry_run",
        ga4_property_label: property.label,
      };
    }

    try {
      const result = await client.admin(
        "POST",
        `/properties/${property.property_id}/customDimensions`,
        body,
      );
      await audit(ctx, {
        tool: "ga4.custom_dimensions.create",
        account: property.label,
        params,
        dryRun: false,
        outcome: "live_success",
        resultSummary: `created custom dimension "${input.display_name}"`,
      });
      return {
        ...(result as Record<string, unknown>),
        outcome: "live_success",
        ga4_property_label: property.label,
      };
    } catch (err) {
      await audit(ctx, {
        tool: "ga4.custom_dimensions.create",
        account: property.label,
        params,
        dryRun: false,
        outcome: "live_failure",
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  },
};
