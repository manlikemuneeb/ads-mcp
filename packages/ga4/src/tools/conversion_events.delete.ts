// TECH-DEBT(option-c-tool-quality): no before-state capture in audit; add in Phase 2.
import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { z } from "zod";
import { Ga4Client } from "../Ga4Client.js";
import { baseWriteInputShape } from "../schemas.js";
import { audit } from "./_writeUtils.js";

const Input = z.object({
  ...baseWriteInputShape,
  conversion_event_name: z
    .string()
    .min(1)
    .describe("Full resource name like 'properties/{p}/conversionEvents/{event_id}'."),
});
type Input = z.infer<typeof Input>;

export const tool: ToolDefinition<Input, unknown> = {
  name: "ga4.conversion_events.delete",
  description: "Remove a conversion event from a GA4 property. High-risk; dry-run by default.",
  platform: "ga4",
  isWriteTool: true,
  inputSchema: Input,
  handler: async (input, ctx) => {
    const property = ctx.config.getAccount("ga4", input.account);
    const decision = ctx.dryRunGate.evaluate({
      toolName: "ga4.conversion_events.delete",
      platform: "ga4",
      accountLabel: property.label,
      isWriteTool: true,
      ...(input.dry_run !== undefined ? { dryRunRequested: input.dry_run } : {}),
    });
    const client = new Ga4Client(property, ctx.rateLimiter);
    const params = { conversion_event_name: input.conversion_event_name };

    if (decision.outcome === "allow_dry_run") {
      await audit(ctx, {
        tool: "ga4.conversion_events.delete",
        account: property.label,
        params,
        dryRun: true,
        outcome: "allow_dry_run",
        resultSummary: `would delete ${input.conversion_event_name}`,
      });
      return { outcome: "allow_dry_run", ga4_property_label: property.label };
    }

    try {
      await client.admin("DELETE", `/${input.conversion_event_name}`);
      await audit(ctx, {
        tool: "ga4.conversion_events.delete",
        account: property.label,
        params,
        dryRun: false,
        outcome: "live_success",
      });
      return { outcome: "live_success", ga4_property_label: property.label };
    } catch (err) {
      await audit(ctx, {
        tool: "ga4.conversion_events.delete",
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
