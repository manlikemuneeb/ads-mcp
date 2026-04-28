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

const AD_FIELDS =
  "name,status,creative{id,name,title,body,image_url,thumbnail_url,video_id,object_type},created_time";

const INSIGHT_FIELDS = [
  "ad_id",
  "ad_name",
  "impressions",
  "clicks",
  "spend",
  "cpc",
  "cpm",
  "ctr",
  "reach",
  "frequency",
  "actions",
  "cost_per_action_type",
  "video_p25_watched_actions",
  "video_p50_watched_actions",
  "video_p75_watched_actions",
  "video_p100_watched_actions",
].join(",");

export const tool: ToolDefinition<Input, unknown> = {
  name: "meta.insights.creative",
  description:
    "Compare performance across individual ad creatives (images, videos, copy) with creative details inline.",
  platform: "meta",
  isWriteTool: false,
  inputSchema: Input,
  handler: async (input, ctx) => {
    const account = ctx.config.getAccount("meta", input.account);
    const client = new MetaClient(account, ctx.rateLimiter);
    const parent = input.campaign_id ?? client.getAccountPath();
    const adsPath = input.campaign_id ? `/${input.campaign_id}/ads` : `/${client.getAccountPath()}/ads`;

    const [ads, insights] = await Promise.all([
      client.get(adsPath, { fields: AD_FIELDS, limit: 50 }),
      client
        .get(`/${parent}/insights`, {
          fields: INSIGHT_FIELDS,
          date_preset: input.date_preset,
          level: "ad",
          limit: 50,
        })
        .catch((err) => ({ data: [], error: (err as Error).message })),
    ]);
    const adData = (ads as { data?: unknown[] }).data ?? [];
    return {
      ads: adData,
      insights: (insights as { data?: unknown[] }).data ?? [],
      total_ads: adData.length,
      meta_account_label: account.label,
    };
  },
};
