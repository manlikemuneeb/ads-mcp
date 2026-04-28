import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { z } from "zod";
import { MetaClient } from "../MetaClient.js";
import { baseInputShape, DatePreset } from "../schemas.js";

const Input = z.object({
  ...baseInputShape,
  date_preset: DatePreset,
  campaign_id: z
    .string()
    .optional()
    .describe("Limit to a campaign. Omit for account-wide breakdown."),
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
  name: "meta.insights.placements",
  description:
    "Break down Meta ad performance by placement (Facebook Feed, Instagram Stories, Reels, Audience Network).",
  platform: "meta",
  isWriteTool: false,
  inputSchema: Input,
  handler: async (input, ctx) => {
    const account = ctx.config.getAccount("meta", input.account);
    const client = new MetaClient(account, ctx.rateLimiter);
    const parent = input.campaign_id ?? client.getAccountPath();
    const result = (await client.get(`/${parent}/insights`, {
      fields: FIELDS,
      date_preset: input.date_preset,
      breakdowns: "publisher_platform,platform_position",
      limit: 100,
    })) as { data?: unknown[]; paging?: unknown };
    return {
      scope: input.campaign_id ? `campaign:${input.campaign_id}` : "account",
      data: result.data ?? [],
      paging: result.paging ?? null,
      meta_account_label: account.label,
    };
  },
};
