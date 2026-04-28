import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { z } from "zod";
import { MetaClient } from "../MetaClient.js";
import { baseInputShape } from "../schemas.js";

const Input = z.object({
  ...baseInputShape,
  form_id: z.string().min(1).describe("Lead gen form ID."),
  limit: z
    .number()
    .int()
    .positive()
    .max(500)
    .default(100)
    .describe("Max leads per page; Meta caps at 500."),
  after: z
    .string()
    .optional()
    .describe(
      "Pagination cursor from the previous response's paging.cursors.after. Omit on the first call.",
    ),
});
type Input = z.infer<typeof Input>;

const FIELDS = [
  "id",
  "created_time",
  "ad_id",
  "ad_name",
  "adset_id",
  "adset_name",
  "campaign_id",
  "campaign_name",
  "form_id",
  "field_data",
  "platform",
].join(",");

export const tool: ToolDefinition<Input, unknown> = {
  name: "meta.lead_gen_forms.get_leads",
  description:
    "Pull leads collected by a Meta lead gen form, including each respondent's field answers and the ad/campaign they came from. Supports pagination via the `after` cursor. Required permission: leads_retrieval (or page admin role).",
  platform: "meta",
  isWriteTool: false,
  inputSchema: Input,
  handler: async (input, ctx) => {
    const account = ctx.config.getAccount("meta", input.account);
    const client = new MetaClient(account, ctx.rateLimiter);
    const query: Record<string, string | number> = {
      fields: FIELDS,
      limit: input.limit,
    };
    if (input.after) query.after = input.after;
    const result = (await client.get(`/${input.form_id}/leads`, query)) as {
      data?: unknown[];
      paging?: { cursors?: { after?: string } };
    };
    return {
      leads: result.data ?? [],
      next_cursor: result.paging?.cursors?.after ?? null,
      form_id: input.form_id,
      meta_account_label: account.label,
    };
  },
};
