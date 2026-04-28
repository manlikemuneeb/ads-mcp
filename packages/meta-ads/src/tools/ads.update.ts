import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { z } from "zod";
import { MetaClient } from "../MetaClient.js";
import { baseWriteInputShape } from "../schemas.js";

const Input = z
  .object({
    ...baseWriteInputShape,
    ad_id: z.string().min(1),
    name: z.string().optional(),
    status: z.enum(["ACTIVE", "PAUSED", "ARCHIVED", "DELETED"]).optional(),
    creative_id: z
      .string()
      .optional()
      .describe("Swap in a new creative by id. The creative must already exist."),
    tracking_specs: z.array(z.record(z.unknown())).optional(),
    conversion_domain: z.string().optional(),
    bid_amount_cents: z.number().int().positive().optional(),
    display_sequence: z.number().int().optional(),
    priority: z.number().int().min(0).max(2).optional(),
    engagement_audience: z.boolean().optional(),
    adlabels: z.array(z.object({ name: z.string() })).optional(),
    additional_fields: z.record(z.unknown()).optional(),
  })
  .refine(
    (v) =>
      v.name !== undefined ||
      v.status !== undefined ||
      v.creative_id !== undefined ||
      v.tracking_specs !== undefined ||
      v.conversion_domain !== undefined ||
      v.bid_amount_cents !== undefined ||
      v.display_sequence !== undefined ||
      v.priority !== undefined ||
      v.engagement_audience !== undefined ||
      v.adlabels !== undefined ||
      v.additional_fields !== undefined,
    { message: "At least one mutable field must be provided." },
  );
type Input = z.infer<typeof Input>;

export const tool: ToolDefinition<Input, unknown> = {
  name: "meta.ads.update",
  description:
    "Update a Meta ad's mutable fields: rename, change status, or swap to a different creative_id. Only changed fields are sent. Dry-run by default.",
  platform: "meta",
  isWriteTool: true,
  inputSchema: Input,
  handler: async (input, ctx) => {
    const account = ctx.config.getAccount("meta", input.account);
    const decision = ctx.dryRunGate.evaluate({
      toolName: "meta.ads.update",
      platform: "meta",
      accountLabel: account.label,
      isWriteTool: true,
      ...(input.dry_run !== undefined ? { dryRunRequested: input.dry_run } : {}),
    });
    const client = new MetaClient(account, ctx.rateLimiter);

    let previous: Record<string, unknown> = {};
    try {
      previous = (await client.get(`/${input.ad_id}`, {
        fields: "name,status,creative",
      })) as Record<string, unknown>;
    } catch {
      previous = {};
    }

    const body: Record<string, unknown> = {};
    if (input.name !== undefined) body.name = input.name;
    if (input.status !== undefined) body.status = input.status;
    if (input.creative_id !== undefined)
      body.creative = { creative_id: input.creative_id };
    if (input.tracking_specs !== undefined) body.tracking_specs = input.tracking_specs;
    if (input.conversion_domain !== undefined)
      body.conversion_domain = input.conversion_domain;
    if (input.bid_amount_cents !== undefined) body.bid_amount = input.bid_amount_cents;
    if (input.display_sequence !== undefined)
      body.display_sequence = input.display_sequence;
    if (input.priority !== undefined) body.priority = input.priority;
    if (input.engagement_audience !== undefined)
      body.engagement_audience = input.engagement_audience;
    if (input.adlabels !== undefined) body.adlabels = input.adlabels;
    if (input.additional_fields !== undefined) Object.assign(body, input.additional_fields);

    const params: Record<string, unknown> = { ad_id: input.ad_id, ...body };

    if (decision.outcome === "allow_dry_run") {
      await ctx.auditLogger.log({
        tool: "meta.ads.update",
        platform: "meta",
        account: account.label,
        params,
        dry_run: true,
        outcome: "allow_dry_run",
        result_summary: `would update ad ${input.ad_id}`,
      });
      return {
        ad_id: input.ad_id,
        previous,
        changes: body,
        outcome: "allow_dry_run",
        meta_account_label: account.label,
      };
    }

    try {
      await client.post(`/${input.ad_id}`, body);
      await ctx.auditLogger.log({
        tool: "meta.ads.update",
        platform: "meta",
        account: account.label,
        params,
        dry_run: false,
        outcome: "live_success",
        result_summary: `updated ad ${input.ad_id}`,
      });
      return {
        ad_id: input.ad_id,
        previous,
        changes: body,
        outcome: "live_success",
        meta_account_label: account.label,
      };
    } catch (err) {
      await ctx.auditLogger.log({
        tool: "meta.ads.update",
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
