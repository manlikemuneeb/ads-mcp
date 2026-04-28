import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { z } from "zod";
import { Ga4Client } from "../Ga4Client.js";
import { baseWriteInputShape } from "../schemas.js";
import { audit } from "./_writeUtils.js";

/**
 * GA4 Admin API:
 *   POST /v1beta/properties/{id}/customMetrics
 * docs: https://developers.google.com/analytics/devguides/config/admin/v1/rest/v1beta/properties.customMetrics/create
 */
const Input = z.object({
  ...baseWriteInputShape,
  parameter_name: z
    .string()
    .min(1)
    .describe(
      "Tag/event parameter name this metric is sourced from (e.g. 'order_value').",
    ),
  display_name: z.string().min(1).describe("Human-readable name shown in GA4 reports."),
  description: z.string().optional(),
  measurement_unit: z
    .enum([
      "STANDARD",
      "CURRENCY",
      "FEET",
      "METERS",
      "KILOMETERS",
      "MILES",
      "MILLISECONDS",
      "SECONDS",
      "MINUTES",
      "HOURS",
    ])
    .default("STANDARD")
    .describe("Measurement unit. Use CURRENCY for monetary metrics."),
  scope: z
    .enum(["EVENT"])
    .default("EVENT")
    .describe("Metric scope. GA4 currently only supports EVENT for custom metrics."),
});
type Input = z.infer<typeof Input>;

export const tool: ToolDefinition<Input, unknown> = {
  name: "ga4.custom_metrics.create",
  description:
    "Create a custom metric on a GA4 property. Required fields: parameter_name, display_name, measurement_unit. Dry-run by default.",
  platform: "ga4",
  isWriteTool: true,
  inputSchema: Input,
  handler: async (input, ctx) => {
    const property = ctx.config.getAccount("ga4", input.account);
    const decision = ctx.dryRunGate.evaluate({
      toolName: "ga4.custom_metrics.create",
      platform: "ga4",
      accountLabel: property.label,
      isWriteTool: true,
      ...(input.dry_run !== undefined ? { dryRunRequested: input.dry_run } : {}),
    });
    const client = new Ga4Client(property, ctx.rateLimiter);

    const body: Record<string, unknown> = {
      parameterName: input.parameter_name,
      displayName: input.display_name,
      measurementUnit: input.measurement_unit,
      scope: input.scope,
    };
    if (input.description !== undefined) body.description = input.description;

    const params: Record<string, unknown> = {
      parameter_name: input.parameter_name,
      display_name: input.display_name,
      measurement_unit: input.measurement_unit,
      scope: input.scope,
      ...(input.description !== undefined ? { description: input.description } : {}),
    };

    if (decision.outcome === "allow_dry_run") {
      await audit(ctx, {
        tool: "ga4.custom_metrics.create",
        account: property.label,
        params,
        dryRun: true,
        outcome: "allow_dry_run",
        resultSummary: `would create custom metric "${input.display_name}" (unit ${input.measurement_unit}) from parameter ${input.parameter_name}`,
      });
      return {
        parameter_name: input.parameter_name,
        display_name: input.display_name,
        measurement_unit: input.measurement_unit,
        scope: input.scope,
        outcome: "allow_dry_run",
        ga4_property_label: property.label,
      };
    }

    try {
      const result = await client.admin(
        "POST",
        `/properties/${property.property_id}/customMetrics`,
        body,
      );
      await audit(ctx, {
        tool: "ga4.custom_metrics.create",
        account: property.label,
        params,
        dryRun: false,
        outcome: "live_success",
        resultSummary: `created custom metric "${input.display_name}"`,
      });
      return {
        ...(result as Record<string, unknown>),
        outcome: "live_success",
        ga4_property_label: property.label,
      };
    } catch (err) {
      await audit(ctx, {
        tool: "ga4.custom_metrics.create",
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
