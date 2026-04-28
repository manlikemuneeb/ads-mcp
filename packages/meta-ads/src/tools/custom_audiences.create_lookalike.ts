import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { z } from "zod";
import { MetaClient } from "../MetaClient.js";
import { baseWriteInputShape } from "../schemas.js";

/**
 * Lookalike audience: Meta finds users who resemble a source audience
 * within a chosen country, sized as a percentage of that country's
 * Facebook population (1% = closest match, 10% = broadest).
 */

const Input = z.object({
  ...baseWriteInputShape,
  name: z.string().min(1),
  source_audience_id: z
    .string()
    .min(1)
    .describe(
      "ID of an existing custom audience, page, or pixel that the lookalike is built from.",
    ),
  country: z
    .string()
    .length(2)
    .optional()
    .describe(
      "Two-letter ISO country code (e.g. 'US', 'CA', 'GB'). Required unless you're using country_groups for multi-country lookalikes.",
    ),
  country_groups: z
    .array(z.string())
    .optional()
    .describe(
      "Multi-country lookalike groups (e.g. ['worldwide', 'europe']). Mutually exclusive with country.",
    ),
  ratio: z
    .number()
    .min(0.01)
    .max(0.2)
    .default(0.01)
    .describe(
      "Lookalike ratio: 0.01 to 0.20 (1% to 20% of country population). Smaller = closer match, larger = broader reach.",
    ),
  starting_ratio: z
    .number()
    .min(0)
    .max(0.2)
    .optional()
    .describe(
      "For 'reach' type lookalikes, the lower bound of the audience size band (e.g. 0.05 with ratio=0.10 → 5-10% lookalike).",
    ),
  type: z
    .enum(["similarity", "reach", "value_based"])
    .default("similarity")
    .describe(
      "similarity = closest match (default). reach = broader audience prioritizing scale. value_based = predicted high-value customers (requires source audience with purchase value data).",
    ),
  description: z.string().optional(),
  // Escape hatch
  additional_fields: z
    .record(z.unknown())
    .optional()
    .describe(
      "Any additional Meta-supported field (e.g. conversion_type, multinational lookalike grammar). Merged verbatim.",
    ),
});
type Input = z.infer<typeof Input>;

export const tool: ToolDefinition<Input, unknown> = {
  name: "meta.custom_audiences.create_lookalike",
  description:
    "Create a lookalike audience from a source audience. Meta builds an audience of users who resemble the source within the chosen country. Dry-run by default.",
  platform: "meta",
  isWriteTool: true,
  inputSchema: Input,
  handler: async (input, ctx) => {
    const account = ctx.config.getAccount("meta", input.account);
    const decision = ctx.dryRunGate.evaluate({
      toolName: "meta.custom_audiences.create_lookalike",
      platform: "meta",
      accountLabel: account.label,
      isWriteTool: true,
      ...(input.dry_run !== undefined ? { dryRunRequested: input.dry_run } : {}),
    });
    const client = new MetaClient(account, ctx.rateLimiter);
    const acctPath = client.getAccountPath();

    const lookalikeSpec: Record<string, unknown> = {
      ratio: input.ratio,
      type: input.type,
    };
    if (input.country !== undefined) lookalikeSpec.country = input.country;
    if (input.country_groups !== undefined)
      lookalikeSpec.country_groups = input.country_groups;
    if (input.starting_ratio !== undefined)
      lookalikeSpec.starting_ratio = input.starting_ratio;

    const body: Record<string, unknown> = {
      name: input.name,
      subtype: "LOOKALIKE",
      origin_audience_id: input.source_audience_id,
      lookalike_spec: lookalikeSpec,
    };
    if (input.description !== undefined) body.description = input.description;
    if (input.additional_fields !== undefined) Object.assign(body, input.additional_fields);

    const params = {
      name: input.name,
      source_audience_id: input.source_audience_id,
      country: input.country,
      ratio: input.ratio,
    };

    if (decision.outcome === "allow_dry_run") {
      await ctx.auditLogger.log({
        tool: "meta.custom_audiences.create_lookalike",
        platform: "meta",
        account: account.label,
        params,
        dry_run: true,
        outcome: "allow_dry_run",
        result_summary: `would create ${(input.ratio * 100).toFixed(0)}% lookalike "${input.name}" in ${input.country} from audience ${input.source_audience_id}`,
      });
      return {
        name: input.name,
        country: input.country,
        ratio: input.ratio,
        source_audience_id: input.source_audience_id,
        outcome: "allow_dry_run",
        meta_account_label: account.label,
      };
    }

    try {
      const result = (await client.post(`/${acctPath}/customaudiences`, body)) as {
        id?: string;
      };
      await ctx.auditLogger.log({
        tool: "meta.custom_audiences.create_lookalike",
        platform: "meta",
        account: account.label,
        params,
        dry_run: false,
        outcome: "live_success",
        result_summary: `created lookalike ${result.id ?? "<no id>"} "${input.name}"`,
      });
      return {
        ...(result.id ? { audience_id: result.id } : {}),
        name: input.name,
        country: input.country,
        ratio: input.ratio,
        source_audience_id: input.source_audience_id,
        outcome: "live_success",
        meta_account_label: account.label,
      };
    } catch (err) {
      await ctx.auditLogger.log({
        tool: "meta.custom_audiences.create_lookalike",
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
