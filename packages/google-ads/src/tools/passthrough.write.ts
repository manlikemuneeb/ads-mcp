// Fallback path for Google Ads :mutate operations not yet covered by named tools.
// Prefer named tools (google_ads.campaigns.pause/resume/update_budget) over
// passthrough — they validate inputs with Zod and surface dry-run previews.
import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { z } from "zod";
import { GoogleAdsClient } from "../GoogleAdsClient.js";
import { baseWriteInputShape } from "../schemas.js";
import { audit } from "./_writeUtils.js";

const Input = z.object({
  ...baseWriteInputShape,
  resource: z
    .enum(["campaigns", "campaignBudgets", "adGroups", "adGroupAds", "adGroupCriteria", "conversionActions"])
    .describe("Mutate target resource."),
  operations: z.array(z.unknown()).min(1).describe("Mutate operations array per Google Ads API."),
  confirm_passthrough: z.literal(true),
});
type Input = z.infer<typeof Input>;

export const tool: ToolDefinition<Input, unknown> = {
  name: "google_ads.passthrough.mutate",
  description:
    "Fallback: invoke any /customers/{id}/{resource}:mutate endpoint with raw operations. Use only when no named tool exists. Prefer google_ads.campaigns.pause/resume/update_budget. Requires confirm_passthrough=true. Dry-run by default.",
  platform: "google_ads",
  isWriteTool: true,
  inputSchema: Input,
  handler: async (input, ctx) => {
    const account = ctx.config.getAccount("google_ads", input.account);
    const decision = ctx.dryRunGate.evaluate({
      toolName: "google_ads.passthrough.mutate",
      platform: "google_ads",
      accountLabel: account.label,
      isWriteTool: true,
      ...(input.dry_run !== undefined ? { dryRunRequested: input.dry_run } : {}),
    });
    const client = new GoogleAdsClient(account, ctx.rateLimiter);
    const params = { resource: input.resource, operations: input.operations };

    if (decision.outcome === "allow_dry_run") {
      await audit(ctx, {
        tool: "google_ads.passthrough.mutate",
        account: account.label,
        params,
        dryRun: true,
        outcome: "allow_dry_run",
        resultSummary: `would mutate ${input.resource} (${input.operations.length} ops)`,
      });
      return {
        outcome: "allow_dry_run",
        resource: input.resource,
        ops_count: input.operations.length,
        google_ads_account_label: account.label,
      };
    }

    try {
      const result = await client.post(
        `/customers/${client.getCustomerId()}/${input.resource}:mutate`,
        { operations: input.operations },
      );
      await audit(ctx, {
        tool: "google_ads.passthrough.mutate",
        account: account.label,
        params,
        dryRun: false,
        outcome: "live_success",
      });
      return { ...(result as Record<string, unknown>), outcome: "live_success", google_ads_account_label: account.label };
    } catch (err) {
      await audit(ctx, {
        tool: "google_ads.passthrough.mutate",
        account: account.label,
        params,
        dryRun: false,
        outcome: "live_failure",
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  },
};
