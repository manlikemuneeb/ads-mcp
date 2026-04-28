import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { z } from "zod";
import { MetaClient } from "../MetaClient.js";
import { baseInputShape } from "../schemas.js";

const Input = z.object({
  ...baseInputShape,
  page_id: z
    .string()
    .min(1)
    .describe(
      "Facebook Page ID that owns the lead forms. Lead gen forms live on the Page, not the ad account.",
    ),
  limit: z.number().int().positive().max(500).default(100),
});
type Input = z.infer<typeof Input>;

const FIELDS = [
  "name",
  "status",
  "locale",
  "questions",
  "leads_count",
  "created_time",
  "expired_leads_count",
].join(",");

export const tool: ToolDefinition<Input, unknown> = {
  name: "meta.lead_gen_forms.list",
  description:
    "List lead gen forms attached to a Facebook Page. Returns form name, status, question schema, and lead count per form. Use meta.lead_gen_forms.get_leads to pull the actual lead submissions.",
  platform: "meta",
  isWriteTool: false,
  inputSchema: Input,
  handler: async (input, ctx) => {
    const account = ctx.config.getAccount("meta", input.account);
    const client = new MetaClient(account, ctx.rateLimiter);
    const result = (await client.get(`/${input.page_id}/leadgen_forms`, {
      fields: FIELDS,
      limit: input.limit,
    })) as { data?: unknown[]; paging?: unknown };
    return {
      lead_gen_forms: result.data ?? [],
      paging: result.paging ?? null,
      page_id: input.page_id,
      meta_account_label: account.label,
    };
  },
};
