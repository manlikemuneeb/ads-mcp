import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { z } from "zod";
import { LINKEDIN_ANALYTICS_FIELDS_ACCOUNT_OVERVIEW } from "../fields.js";
import { LinkedInClient } from "../LinkedInClient.js";
import { decorateAnalyticsWithNames } from "../nameResolution.js";
import { baseInputShape, DateRangeString } from "../schemas.js";
import { accountsListExpression, inlineDateRange } from "../urns.js";

const Input = z.object({
  ...baseInputShape,
  date_range: DateRangeString.optional().describe(
    "Optional 'YYYY-MM-DD, YYYY-MM-DD' to attach analytics rollup. Omit for account info only.",
  ),
});
type Input = z.infer<typeof Input>;

// Sourced from packages/linkedin-ads/fixtures/fields-analytics.json
// slot: fields_account_overview.
const ANALYTICS_FIELDS = LINKEDIN_ANALYTICS_FIELDS_ACCOUNT_OVERVIEW;

export const tool: ToolDefinition<Input, unknown> = {
  name: "linkedin.account.overview",
  description:
    "LinkedIn Ads account overview: account details + optional analytics rollup over a date range.",
  platform: "linkedin",
  isWriteTool: false,
  inputSchema: Input,
  handler: async (input, ctx) => {
    const account = ctx.config.getAccount("linkedin", input.account);
    const client = new LinkedInClient(account, ctx.rateLimiter);

    const accountInfo = await client.get(`/adAccounts/${account.ad_account_id}`).catch((err) => ({
      error: (err as Error).message,
    }));

    let analytics: unknown = null;
    if (input.date_range) {
      const [startStr, endStr] = input.date_range.split(",").map((s) => s.trim());
      analytics = await client
        .get("/adAnalytics", {
          q: "analytics",
          pivot: "ACCOUNT",
          timeGranularity: "ALL",
          dateRange: inlineDateRange(startStr ?? "", endStr ?? ""),
          accounts: accountsListExpression([account.ad_account_id]),
          fields: ANALYTICS_FIELDS,
        })
        .catch((err) => ({ error: (err as Error).message }));

      // Decorate ACCOUNT-pivot rows with the account name. We already have it
      // from accountInfo above, so this is free (no extra API call).
      const info = accountInfo as { name?: string } | undefined;
      const accountName = info?.name;
      if (
        accountName &&
        analytics &&
        typeof analytics === "object" &&
        Array.isArray((analytics as { elements?: unknown[] }).elements)
      ) {
        const elements = (analytics as { elements: unknown[] }).elements;
        decorateAnalyticsWithNames(elements, {
          [`urn:li:sponsoredAccount:${account.ad_account_id}`]: accountName,
        });
      }
    }

    return {
      account: accountInfo,
      analytics,
      linkedin_account_label: account.label,
    };
  },
};
