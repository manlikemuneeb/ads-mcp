import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { z } from "zod";
import { MetaClient } from "../MetaClient.js";
import { baseWriteInputShape } from "../schemas.js";

/**
 * Meta ad creation. The creative must already exist (use meta.creatives.create_image
 * to mint one, or pass an existing creative_id from the library). The ad ties a
 * creative to an ad set.
 *
 * Field reference: https://developers.facebook.com/docs/marketing-api/reference/adgroup
 */

const Input = z.object({
  ...baseWriteInputShape,
  adset_id: z.string().min(1).describe("Parent ad set ID."),
  creative_id: z.string().min(1).describe("Existing creative ID to attach."),
  name: z.string().min(1),
  status: z.enum(["ACTIVE", "PAUSED"]).default("PAUSED"),
  // Tracking
  tracking_specs: z
    .array(z.record(z.unknown()))
    .optional()
    .describe(
      "Optional tracking specs (pixels, app events). Pass-through to Meta verbatim.",
    ),
  conversion_domain: z
    .string()
    .optional()
    .describe(
      "Required for some web-conversion campaigns under iOS 14.5+ rules. The domain that visitors land on (e.g. 'hachiai.com').",
    ),
  // Bidding override at the ad level
  bid_amount_cents: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      "Override the ad set's bid for this specific ad. In account-currency cents.",
    ),
  // Display behavior
  display_sequence: z
    .number()
    .int()
    .optional()
    .describe(
      "Order in which ads in the same ad set are shown to a user (1, 2, 3, ...). Used for sequential storytelling campaigns.",
    ),
  priority: z
    .number()
    .int()
    .min(0)
    .max(2)
    .optional()
    .describe(
      "Relative priority of this ad vs others in the ad set. 0 = lowest, 2 = highest. Used by some catalog ad types.",
    ),
  // Audience overlap management
  engagement_audience: z
    .boolean()
    .optional()
    .describe(
      "When true, users who engage with this ad are added to the engagement custom audience automatically.",
    ),
  // Organization
  adlabels: z.array(z.object({ name: z.string() })).optional(),
  // Source ad reference (for duplicating)
  source_ad_id: z
    .string()
    .optional()
    .describe(
      "If duplicating from an existing ad, the source ad ID. Meta uses this for reporting attribution.",
    ),
  // Escape hatch
  additional_fields: z
    .record(z.unknown())
    .optional()
    .describe(
      "Any additional Meta-supported field (e.g. recommender_settings, draft_adgroup_id, ad_creative_id_for_legacy_warning). Merged verbatim.",
    ),
});
type Input = z.infer<typeof Input>;

export const tool: ToolDefinition<Input, unknown> = {
  name: "meta.ads.create",
  description:
    "Create a Meta ad under an existing ad set, attaching a previously-created creative. Defaults to status=PAUSED. Dry-run by default.",
  platform: "meta",
  isWriteTool: true,
  inputSchema: Input,
  handler: async (input, ctx) => {
    const account = ctx.config.getAccount("meta", input.account);
    const decision = ctx.dryRunGate.evaluate({
      toolName: "meta.ads.create",
      platform: "meta",
      accountLabel: account.label,
      isWriteTool: true,
      ...(input.dry_run !== undefined ? { dryRunRequested: input.dry_run } : {}),
    });
    const client = new MetaClient(account, ctx.rateLimiter);
    const acctPath = client.getAccountPath();

    const body: Record<string, unknown> = {
      adset_id: input.adset_id,
      creative: { creative_id: input.creative_id },
      name: input.name,
      status: input.status,
    };
    if (input.tracking_specs) body.tracking_specs = input.tracking_specs;
    if (input.conversion_domain !== undefined)
      body.conversion_domain = input.conversion_domain;
    if (input.bid_amount_cents !== undefined) body.bid_amount = input.bid_amount_cents;
    if (input.display_sequence !== undefined)
      body.display_sequence = input.display_sequence;
    if (input.priority !== undefined) body.priority = input.priority;
    if (input.engagement_audience !== undefined)
      body.engagement_audience = input.engagement_audience;
    if (input.adlabels !== undefined) body.adlabels = input.adlabels;
    if (input.source_ad_id !== undefined) body.source_ad_id = input.source_ad_id;
    if (input.additional_fields !== undefined) Object.assign(body, input.additional_fields);

    const params = {
      adset_id: input.adset_id,
      creative_id: input.creative_id,
      name: input.name,
      status: input.status,
    };

    if (decision.outcome === "allow_dry_run") {
      await ctx.auditLogger.log({
        tool: "meta.ads.create",
        platform: "meta",
        account: account.label,
        params,
        dry_run: true,
        outcome: "allow_dry_run",
        result_summary: `would create ad "${input.name}" under ad set ${input.adset_id}`,
      });
      return {
        name: input.name,
        adset_id: input.adset_id,
        creative_id: input.creative_id,
        status: input.status,
        outcome: "allow_dry_run",
        meta_account_label: account.label,
      };
    }

    try {
      const result = (await client.post(`/${acctPath}/ads`, body)) as { id?: string };
      await ctx.auditLogger.log({
        tool: "meta.ads.create",
        platform: "meta",
        account: account.label,
        params,
        dry_run: false,
        outcome: "live_success",
        result_summary: `created ad ${result.id ?? "<no id>"} "${input.name}"`,
      });
      return {
        ...(result.id ? { ad_id: result.id } : {}),
        name: input.name,
        adset_id: input.adset_id,
        creative_id: input.creative_id,
        status: input.status,
        outcome: "live_success",
        meta_account_label: account.label,
      };
    } catch (err) {
      await ctx.auditLogger.log({
        tool: "meta.ads.create",
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
