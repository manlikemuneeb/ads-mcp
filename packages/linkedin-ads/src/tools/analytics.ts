import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { z } from "zod";
import { LinkedInClient } from "../LinkedInClient.js";
import { baseInputShape, DateRangeString, Pivot } from "../schemas.js";
import { accountsListExpression, inlineDateRange } from "../urns.js";

const Input = z.object({
  ...baseInputShape,
  date_range: DateRangeString,
  pivot: Pivot,
  time_granularity: z.enum(["ALL", "DAILY", "MONTHLY", "YEARLY"]).default("DAILY"),
});
type Input = z.infer<typeof Input>;

// Per LinkedIn docs (li-lms-2026-04 ads-reporting), the canonical fields list
// is comma-separated, max 20 metrics. Always include `dateRange` and
// `pivotValues` so the response carries time and entity context.
const FIELDS = [
  "dateRange",
  "pivotValues",
  "impressions",
  "clicks",
  "costInLocalCurrency",
  "costInUsd",
  "approximateMemberReach",
  "landingPageClicks",
  "shares",
  "follows",
  "likes",
  "comments",
  "totalEngagements",
  "videoViews",
  "videoFirstQuartileCompletions",
  "videoMidpointCompletions",
  "videoThirdQuartileCompletions",
  "videoCompletions",
  "externalWebsiteConversions",
].join(",");

export const tool: ToolDefinition<Input, unknown> = {
  name: "linkedin.analytics",
  description:
    "LinkedIn Ads analytics over a date range, broken down by a pivot (CAMPAIGN, CREATIVE, ACCOUNT, MEMBER_COMPANY, MEMBER_JOB_TITLE, MEMBER_INDUSTRY).",
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
    return {
      pivot: input.pivot,
      time_granularity: input.time_granularity,
      elements: result.elements ?? [],
      total: result.paging?.total ?? (result.elements ?? []).length,
      linkedin_account_label: account.label,
    };
  },
};
