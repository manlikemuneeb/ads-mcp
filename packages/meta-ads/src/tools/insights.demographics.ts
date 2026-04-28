import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { z } from "zod";
import { MetaClient } from "../MetaClient.js";
import { baseInputShape, DatePreset } from "../schemas.js";

const BREAKDOWN_MAP: Record<string, string> = {
  age_gender: "age,gender",
  country: "country",
  region: "region",
  dma: "dma",
};

const Input = z.object({
  ...baseInputShape,
  date_preset: DatePreset,
  breakdown_type: z.enum(["age_gender", "country", "region", "dma"]).default("age_gender"),
});
type Input = z.infer<typeof Input>;

const FIELDS = [
  "impressions",
  "clicks",
  "spend",
  "cpc",
  "cpm",
  "ctr",
  "reach",
  "actions",
  "cost_per_action_type",
].join(",");

export const tool: ToolDefinition<Input, unknown> = {
  name: "meta.insights.demographics",
  description: "Break down Meta ad performance by audience demographics: age+gender, country, region, or DMA.",
  platform: "meta",
  isWriteTool: false,
  inputSchema: Input,
  handler: async (input, ctx) => {
    const account = ctx.config.getAccount("meta", input.account);
    const client = new MetaClient(account, ctx.rateLimiter);
    const acctPath = client.getAccountPath();
    const result = (await client.get(`/${acctPath}/insights`, {
      fields: FIELDS,
      date_preset: input.date_preset,
      breakdowns: BREAKDOWN_MAP[input.breakdown_type]!,
      limit: 200,
    })) as { data?: unknown[]; paging?: unknown };
    return {
      breakdown_type: input.breakdown_type,
      data: result.data ?? [],
      paging: result.paging ?? null,
      meta_account_label: account.label,
    };
  },
};
