import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { z } from "zod";
import { LINKEDIN_ANALYTICS_FIELDS_CAMPAIGNS_LIST } from "../fields.js";
import { LinkedInClient } from "../LinkedInClient.js";
import { baseInputShape, DateRangeString } from "../schemas.js";
import { accountsListExpression, inlineDateRange } from "../urns.js";

const Input = z.object({
  ...baseInputShape,
  date_range: DateRangeString.optional().describe(
    "Optional 'YYYY-MM-DD, YYYY-MM-DD' range to attach analytics per campaign.",
  ),
  count: z.number().int().positive().max(500).default(100),
});
type Input = z.infer<typeof Input>;

// Sourced from packages/linkedin-ads/fixtures/fields-analytics.json
// slot: fields_campaigns_list.
const ANALYTICS_FIELDS = LINKEDIN_ANALYTICS_FIELDS_CAMPAIGNS_LIST;

export const tool: ToolDefinition<Input, unknown> = {
  name: "linkedin.campaigns.list",
  description: "List LinkedIn ad campaigns with status, budget, and optional per-campaign analytics.",
  platform: "linkedin",
  isWriteTool: false,
  inputSchema: Input,
  handler: async (input, ctx) => {
    const account = ctx.config.getAccount("linkedin", input.account);
    const client = new LinkedInClient(account, ctx.rateLimiter);

    // adCampaigns moved to account-scoped path. Account is in URL, not search.
    const campaigns = (await client.get(
      `/adAccounts/${account.ad_account_id}/adCampaigns`,
      { q: "search", count: String(input.count) },
    )) as { elements?: unknown[]; paging?: { total?: number } };

    let analytics: unknown = null;
    if (input.date_range) {
      const [startStr, endStr] = input.date_range.split(",").map((s) => s.trim());
      analytics = await client
        .get("/adAnalytics", {
          q: "analytics",
          pivot: "CAMPAIGN",
          timeGranularity: "ALL",
          dateRange: inlineDateRange(startStr ?? "", endStr ?? ""),
          accounts: accountsListExpression([account.ad_account_id]),
          fields: ANALYTICS_FIELDS,
        })
        .catch((err) => ({ error: (err as Error).message }));
    }

    return {
      campaigns: campaigns.elements ?? [],
      total: campaigns.paging?.total ?? (campaigns.elements ?? []).length,
      analytics,
      linkedin_account_label: account.label,
    };
  },
};
