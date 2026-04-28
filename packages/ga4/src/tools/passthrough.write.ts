// TECH-DEBT(option-c-passthrough): replace with named write tools per Admin API resource in Phase 2.
import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { z } from "zod";
import { Ga4Client } from "../Ga4Client.js";
import { baseWriteInputShape } from "../schemas.js";
import { audit } from "./_writeUtils.js";

const Input = z.object({
  ...baseWriteInputShape,
  method: z.enum(["POST", "PATCH", "DELETE"]),
  admin_path: z.string().min(1).describe("Path under /v1beta/, e.g. '/properties/123/audiences'."),
  admin_query: z.record(z.string()).optional(),
  body: z.record(z.unknown()).optional(),
  confirm_passthrough: z
    .literal(true)
    .describe("Required: must be the literal value true to acknowledge passthrough writes are unstructured."),
});
type Input = z.infer<typeof Input>;

export const tool: ToolDefinition<Input, unknown> = {
  name: "ga4.passthrough.write",
  description:
    "Escape hatch: PATCH/POST/DELETE any GA4 Admin API endpoint not covered by named tools. Requires confirm_passthrough=true. Dry-run by default. Logged but without before/after detail.",
  platform: "ga4",
  isWriteTool: true,
  inputSchema: Input,
  handler: async (input, ctx) => {
    const property = ctx.config.getAccount("ga4", input.account);
    const decision = ctx.dryRunGate.evaluate({
      toolName: "ga4.passthrough.write",
      platform: "ga4",
      accountLabel: property.label,
      isWriteTool: true,
      ...(input.dry_run !== undefined ? { dryRunRequested: input.dry_run } : {}),
    });
    const client = new Ga4Client(property, ctx.rateLimiter);
    const params = {
      method: input.method,
      admin_path: input.admin_path,
      ...(input.admin_query ? { admin_query: input.admin_query } : {}),
      ...(input.body ? { body: input.body } : {}),
    };

    if (decision.outcome === "allow_dry_run") {
      await audit(ctx, {
        tool: "ga4.passthrough.write",
        account: property.label,
        params,
        dryRun: true,
        outcome: "allow_dry_run",
        resultSummary: `would ${input.method} ${input.admin_path}`,
      });
      return {
        outcome: "allow_dry_run",
        method: input.method,
        path: input.admin_path,
        ga4_property_label: property.label,
      };
    }

    try {
      const result = await client.admin(
        input.method,
        input.admin_path,
        input.body,
        input.admin_query ?? {},
      );
      await audit(ctx, {
        tool: "ga4.passthrough.write",
        account: property.label,
        params,
        dryRun: false,
        outcome: "live_success",
      });
      return { ...(result as Record<string, unknown>), outcome: "live_success", ga4_property_label: property.label };
    } catch (err) {
      await audit(ctx, {
        tool: "ga4.passthrough.write",
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
