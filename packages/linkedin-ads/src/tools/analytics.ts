import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { z } from "zod";
import { LINKEDIN_ANALYTICS_FIELDS_FULL } from "../fields.js";
import { LinkedInClient } from "../LinkedInClient.js";
import { decorateAnalyticsWithNames, resolveNamesForPivot } from "../nameResolution.js";
import { baseInputShape, DateRangeString, Pivot } from "../schemas.js";
import { accountsListExpression, inlineDateRange } from "../urns.js";

const Input = z.object({
  ...baseInputShape,
  date_range: DateRangeString,
  pivot: Pivot,
  time_granularity: z.enum(["ALL", "DAILY", "MONTHLY", "YEARLY"]).default("DAILY"),
  include_names: z
    .boolean()
    .default(true)
    .describe(
      "When true (default), each row gets a `pivot_name` field with the human-readable name resolved from the URN in `pivotValues`. Currently supported for CAMPAIGN and CAMPAIGN_GROUP pivots; other pivots fall through with raw URNs.",
    ),
});
type Input = z.infer<typeof Input>;

// Field list is sourced from packages/linkedin-ads/fixtures/fields-analytics.json
// (slot: fields_full). LinkedIn caps at 20 fields per analytics request;
// always_include guarantees dateRange + pivotValues are present so the
// response carries time and entity context.
const FIELDS = LINKEDIN_ANALYTICS_FIELDS_FULL;

export const tool: ToolDefinition<Input, unknown> = {
  name: "linkedin.analytics",
  description:
    "LinkedIn Ads analytics over a date range, broken down by a pivot (CAMPAIGN, CREATIVE, ACCOUNT, MEMBER_COMPANY, MEMBER_JOB_TITLE, MEMBER_INDUSTRY). Returns rows with pivotValues (URNs) and metrics; with `include_names: true` (default) each row gets `pivot_name` for CAMPAIGN/CAMPAIGN_GROUP pivots so you can attribute metrics back to human-readable campaign names.",
  platform: "linkedin",
  isWriteTool: false,
  inputSchema: Input,
  handler: async (input, ctx) => {
    const account = ctx.config.getAccount("linkedin", input.account);
    const client = new LinkedInClient(account, ctx.rateLimiter);
    const [startStr, endStr] = input.date_range.split(",").map((s) => s.trim());

    // Canonical inline syntax per docs: dateRange=(start:(year:Y,...),end:(...)),
    // accounts=List(urn%3A...). LinkedInClient's encoder passes %3A through raw.
    const params: Record<string, string> = {
      q: "analytics",
      pivot: input.pivot,
      timeGranularity: input.time_granularity,
      dateRange: inlineDateRange(startStr ?? "", endStr ?? ""),
      accounts: accountsListExpression([account.ad_account_id]),
      fields: FIELDS,
    };

    const result = (await client.get("/adAnalytics", params)) as {
      elements?: unknown[];
      paging?: { total?: number };
    };
    const elements = result.elements ?? [];

    // Optional URN → name decoration (one extra API call when applicable).
    let nameResolution: "applied" | "not_supported" | "skipped" = "skipped";
    if (input.include_names && elements.length > 0) {
      const nameMap = await resolveNamesForPivot(input.pivot, client, account.ad_account_id);
      if (nameMap) {
        decorateAnalyticsWithNames(elements, nameMap);
        nameResolution = "applied";
      } else {
        nameResolution = "not_supported";
      }
    }

    return {
      pivot: input.pivot,
      time_granularity: input.time_granularity,
      elements,
      total: result.paging?.total ?? elements.length,
      name_resolution: nameResolution,
      linkedin_account_label: account.label,
    };
  },
};
