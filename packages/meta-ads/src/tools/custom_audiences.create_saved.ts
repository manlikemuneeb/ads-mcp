import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { z } from "zod";
import { MetaClient } from "../MetaClient.js";
import { baseWriteInputShape } from "../schemas.js";

/**
 * Saved audience: an audience built from a rule that matches users by
 * pixel events, mobile app events, page engagement, or video views over
 * a retention window.
 *
 * The `rule` field is passed through verbatim. Rule grammar:
 *   https://developers.facebook.com/docs/marketing-api/audiences/guides/website-custom-audiences
 *
 * Customer-list audiences (PII upload + match) are intentionally NOT here;
 * they require multipart upload of hashed user data and warrant a separate
 * tool. Tracked for Phase 2.5.
 */

const Input = z.object({
  ...baseWriteInputShape,
  name: z.string().min(1),
  subtype: z
    .enum([
      "WEBSITE",
      "APP",
      "ENGAGEMENT",
      "VIDEO",
      "OFFLINE_CONVERSION",
      "BAG_OF_ACCOUNTS",
      "PARTNER",
      "MANAGED",
      "MULTI_DATABASE",
    ])
    .describe(
      "Source of audience members. WEBSITE = pixel events; APP = mobile SDK; ENGAGEMENT = page/post engagement; VIDEO = video viewers; OFFLINE_CONVERSION = offline event set.",
    ),
  rule: z
    .record(z.unknown())
    .describe(
      "Rule object describing which users to include. See Meta's website-custom-audiences doc for the full grammar.",
    ),
  retention_days: z
    .number()
    .int()
    .min(1)
    .max(180)
    .default(30)
    .describe(
      "How many days to keep matched users in the audience after their event. Max 180.",
    ),
  description: z.string().optional(),
  customer_file_source: z
    .enum([
      "USER_PROVIDED_ONLY",
      "PARTNER_PROVIDED_ONLY",
      "BOTH_USER_AND_PARTNER_PROVIDED",
    ])
    .optional()
    .describe(
      "Required for some audience types when the data ultimately comes from a customer list. Defaults to none.",
    ),
  opt_out_link: z
    .string()
    .url()
    .optional()
    .describe(
      "URL where users can opt out. Required by some compliance flows for partner-provided audience data.",
    ),
  prefill: z
    .boolean()
    .optional()
    .describe(
      "When true, pre-fills the audience with matching users from the past retention_days window. Defaults to true on Meta's side.",
    ),
  rule_aggregation: z
    .enum(["count", "sum", "avg", "min", "max"])
    .optional()
    .describe(
      "Aggregation for value-based rule filtering (e.g. sum of purchase value).",
    ),
  // Escape hatch
  additional_fields: z
    .record(z.unknown())
    .optional()
    .describe(
      "Any additional Meta-supported field (e.g. claim_objective, content_type, exclusions). Merged verbatim.",
    ),
});
type Input = z.infer<typeof Input>;

export const tool: ToolDefinition<Input, unknown> = {
  name: "meta.custom_audiences.create_saved",
  description:
    "Create a saved Meta custom audience from a rule (pixel events, app events, page engagement, or video views). The rule object passes through verbatim; consult Meta's audiences doc for grammar. Dry-run by default.",
  platform: "meta",
  isWriteTool: true,
  inputSchema: Input,
  handler: async (input, ctx) => {
    const account = ctx.config.getAccount("meta", input.account);
    const decision = ctx.dryRunGate.evaluate({
      toolName: "meta.custom_audiences.create_saved",
      platform: "meta",
      accountLabel: account.label,
      isWriteTool: true,
      ...(input.dry_run !== undefined ? { dryRunRequested: input.dry_run } : {}),
    });
    const client = new MetaClient(account, ctx.rateLimiter);
    const acctPath = client.getAccountPath();

    const body: Record<string, unknown> = {
      name: input.name,
      subtype: input.subtype,
      rule: input.rule,
      retention_days: input.retention_days,
    };
    if (input.description !== undefined) body.description = input.description;
    if (input.customer_file_source !== undefined)
      body.customer_file_source = input.customer_file_source;
    if (input.opt_out_link !== undefined) body.opt_out_link = input.opt_out_link;
    if (input.prefill !== undefined) body.prefill = input.prefill;
    if (input.rule_aggregation !== undefined)
      body.rule_aggregation = input.rule_aggregation;
    if (input.additional_fields !== undefined) Object.assign(body, input.additional_fields);

    const params = {
      name: input.name,
      subtype: input.subtype,
      retention_days: input.retention_days,
    };

    if (decision.outcome === "allow_dry_run") {
      await ctx.auditLogger.log({
        tool: "meta.custom_audiences.create_saved",
        platform: "meta",
        account: account.label,
        params,
        dry_run: true,
        outcome: "allow_dry_run",
        result_summary: `would create saved audience "${input.name}" (subtype ${input.subtype})`,
      });
      return {
        name: input.name,
        subtype: input.subtype,
        retention_days: input.retention_days,
        outcome: "allow_dry_run",
        meta_account_label: account.label,
      };
    }

    try {
      const result = (await client.post(`/${acctPath}/customaudiences`, body)) as {
        id?: string;
      };
      await ctx.auditLogger.log({
        tool: "meta.custom_audiences.create_saved",
        platform: "meta",
        account: account.label,
        params,
        dry_run: false,
        outcome: "live_success",
        result_summary: `created saved audience ${result.id ?? "<no id>"} "${input.name}"`,
      });
      return {
        ...(result.id ? { audience_id: result.id } : {}),
        name: input.name,
        subtype: input.subtype,
        retention_days: input.retention_days,
        outcome: "live_success",
        meta_account_label: account.label,
      };
    } catch (err) {
      await ctx.auditLogger.log({
        tool: "meta.custom_audiences.create_saved",
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
