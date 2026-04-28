import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { z } from "zod";
import { META_INSIGHTS_DEMOGRAPHICS } from "../fields.js";
import { MetaClient } from "../MetaClient.js";
import {
  baseInputShape,
  buildInsightsQuery,
  insightsCommonShape,
} from "../schemas.js";

const BREAKDOWN_MAP: Record<string, string> = {
  age_gender: "age,gender",
  age: "age",
  gender: "gender",
  country: "country",
  region: "region",
  dma: "dma",
  publisher_platform: "publisher_platform",
  device_platform: "device_platform",
  impression_device: "impression_device",
};

const Input = z.object({
  ...baseInputShape,
  ...insightsCommonShape,
  breakdown_type: z
    .enum([
      "age_gender",
      "age",
      "gender",
      "country",
      "region",
      "dma",
      "publisher_platform",
      "device_platform",
      "impression_device",
    ])
    .default("age_gender")
    .describe(
      "Demographic dimension. age_gender combines both; use age or gender separately for a single-axis report. country/region/dma are geo. publisher_platform/device_platform/impression_device are useful when you want demographics rolled by surface.",
    ),
});
type Input = z.infer<typeof Input>;

// Sourced from packages/meta-ads/fixtures/fields-insights.json.
const FIELDS = META_INSIGHTS_DEMOGRAPHICS;

export const tool: ToolDefinition<Input, unknown> = {
  name: "meta.insights.demographics",
  description:
    "Break down Meta ad performance by audience demographics: age+gender, country, region, DMA, or surface dimension. Supports custom date ranges, daily/weekly/monthly buckets, server-side filtering, and attribution-window overrides.",
  platform: "meta",
  isWriteTool: false,
  inputSchema: Input,
  handler: async (input, ctx) => {
    const account = ctx.config.getAccount("meta", input.account);
    const client = new MetaClient(account, ctx.rateLimiter);
    const acctPath = client.getAccountPath();

    const query: Record<string, string | number | undefined> = {
      fields: FIELDS,
      breakdowns: BREAKDOWN_MAP[input.breakdown_type]!,
      ...buildInsightsQuery(input),
    };
    if (query.limit === undefined) query.limit = 200;

    const result = (await client.get(`/${acctPath}/insights`, query)) as {
      data?: unknown[];
      paging?: unknown;
    };
    return {
      breakdown_type: input.breakdown_type,
      data: result.data ?? [],
      paging: result.paging ?? null,
      meta_account_label: account.label,
    };
  },
};
