import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { z } from "zod";
import { MetaClient } from "../MetaClient.js";
import { baseInputShape, DatePreset } from "../schemas.js";

const Input = z.object({
  ...baseInputShape,
  date_preset: DatePreset,
  campaign_id: z.string().optional(),
});
type Input = z.infer<typeof Input>;

const FUNNEL_FIELDS = [
  "impressions",
  "clicks",
  "reach",
  "frequency",
  "spend",
  "ctr",
  "cpc",
  "cpm",
  "outbound_clicks",
  "outbound_clicks_ctr",
  "cost_per_outbound_click",
  "website_ctr",
  "actions",
  "action_values",
  "cost_per_action_type",
  "conversion_rate_ranking",
  "quality_ranking",
  "engagement_rate_ranking",
].join(",");

export const tool: ToolDefinition<Input, unknown> = {
  name: "meta.insights.funnel",
  description:
    "Conversion funnel analysis: impressions → clicks → outbound clicks → actions, with quality/engagement/conversion rankings and daily trend.",
  platform: "meta",
  isWriteTool: false,
  inputSchema: Input,
  handler: async (input, ctx) => {
    const account = ctx.config.getAccount("meta", input.account);
    const client = new MetaClient(account, ctx.rateLimiter);
    const parent = input.campaign_id ?? client.getAccountPath();

    const [funnel, daily] = await Promise.all([
      client.get(`/${parent}/insights`, { fields: FUNNEL_FIELDS, date_preset: input.date_preset }),
      client
        .get(`/${parent}/insights`, {
          fields: "impressions,clicks,spend,outbound_clicks,actions",
          date_preset: input.date_preset,
          time_increment: 1,
          limit: 90,
        })
        .catch((err) => ({ data: [], error: (err as Error).message })),
    ]);

    return {
      funnel: (funnel as { data?: unknown[] }).data ?? [],
      daily_trend: (daily as { data?: unknown[] }).data ?? [],
      scope: input.campaign_id ? `campaign:${input.campaign_id}` : "account",
      meta_account_label: account.label,
    };
  },
};
