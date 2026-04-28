// TECH-DEBT(option-c-tool-quality): preview returns input echo; flesh out before/after audit in Phase 2.
import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { z } from "zod";
import { Ga4Client } from "../Ga4Client.js";
import { baseWriteInputShape } from "../schemas.js";
import { audit } from "./_writeUtils.js";

const Input = z.object({
  ...baseWriteInputShape,
  event_name: z.string().min(1).describe("Name of the event to mark as a conversion."),
});
type Input = z.infer<typeof Input>;

export const tool: ToolDefinition<Input, unknown> = {
  name: "ga4.conversion_events.create",
  description: "Mark an event as a conversion event on the configured GA4 property.",
  platform: "ga4",
  isWriteTool: true,
  inputSchema: Input,
  handler: async (input, ctx) => {
    const property = ctx.config.getAccount("ga4", input.account);
    const decision = ctx.dryRunGate.evaluate({
      toolName: "ga4.conversion_events.create",
      platform: "ga4",
      accountLabel: property.label,
      isWriteTool: true,
      ...(input.dry_run !== undefined ? { dryRunRequested: input.dry_run } : {}),
    });
    const client = new Ga4Client(property, ctx.rateLimiter);
    const params = { event_name: input.event_name };

    if (decision.outcome === "allow_dry_run") {
      await audit(ctx, {
        tool: "ga4.conversion_events.create",
        account: property.label,
        params,
        dryRun: true,
        outcome: "allow_dry_run",
        resultSummary: `would mark '${input.event_name}' as conversion`,
      });
      return {
        event_name: input.event_name,
        outcome: "allow_dry_run",
        ga4_property_label: property.label,
      };
    }

    try {
      const result = await client.admin(
        "POST",
        `/properties/${property.property_id}/conversionEvents`,
        { eventName: input.event_name },
      );
      await audit(ctx, {
        tool: "ga4.conversion_events.create",
        account: property.label,
        params,
        dryRun: false,
        outcome: "live_success",
      });
      return { ...(result as Record<string, unknown>), outcome: "live_success", ga4_property_label: property.label };
    } catch (err) {
      await audit(ctx, {
        tool: "ga4.conversion_events.create",
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
