import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { z } from "zod";
import { LinkedInClient } from "../LinkedInClient.js";
import { baseInputShape } from "../schemas.js";
import { searchByCampaignExpression } from "../urns.js";

const Input = z.object({
  ...baseInputShape,
  campaign_id: z
    .string()
    .optional()
    .describe(
      "Filter creatives to a specific campaign ID. Omit for all creatives in the account.",
    ),
  count: z
    .number()
    .int()
    .positive()
    .max(500)
    .default(100)
    .describe("Maximum creatives to return per page (LinkedIn caps at 500)."),
});
type Input = z.infer<typeof Input>;

export const tool: ToolDefinition<Input, unknown> = {
  name: "linkedin.creatives.list",
  description:
    "List LinkedIn ad creatives for an account, optionally filtered to a single campaign. Returns the creative URN, status, type, and campaign reference per item. Read-only.",
  platform: "linkedin",
  isWriteTool: false,
  inputSchema: Input,
  handler: async (input, ctx) => {
    const account = ctx.config.getAccount("linkedin", input.account);
    const client = new LinkedInClient(account, ctx.rateLimiter);

    // LinkedIn /adAccounts/{id}/creatives requires q=criteria and (when
    // filtering by campaign) a `search=(campaigns:(values:List(...)))`
    // expression. The bare `campaigns=` param is silently ignored.
    const params: Record<string, string | number> = {
      q: "criteria",
      count: input.count,
    };
    if (input.campaign_id) {
      params.search = searchByCampaignExpression([input.campaign_id]);
    }

    const result = (await client.get(
      `/adAccounts/${account.ad_account_id}/creatives`,
      params,
    )) as { elements?: unknown[]; paging?: { total?: number } };

    return {
      creatives: result.elements ?? [],
      total: result.paging?.total ?? (result.elements ?? []).length,
      ...(input.campaign_id ? { campaign_id: input.campaign_id } : {}),
      linkedin_account_label: account.label,
    };
  },
};
