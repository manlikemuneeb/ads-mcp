import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { z } from "zod";
import { MetaClient } from "../MetaClient.js";
import { baseInputShape, DatePreset } from "../schemas.js";

const Input = z.object({
  ...baseInputShape,
  adset_id: z.string().min(1).describe("Meta ad set ID to list ads for."),
  date_preset: DatePreset,
  limit: z.number().int().positive().max(500).default(50),
});
type Input = z.infer<typeof Input>;

const AD_FIELDS = ["name", "status", "effective_status", "creative", "tracking_specs", "created_time"].join(
  ",",
);

const INSIGHT_FIELDS = [
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
  name: "meta.ads.list",
  description: "List ads in a Meta ad set with creative details and per-ad performance metrics.",
  platform: "meta",
  isWriteTool: false,
  inputSchema: Input,
  handler: async (input, ctx) => {
    const account = ctx.config.getAccount("meta", input.account);
    const client = new MetaClient(account, ctx.rateLimiter);
    const [ads, insights] = await Promise.all([
      client.get(`/${input.adset_id}/ads`, { fields: AD_FIELDS, limit: input.limit }),
      client
        .get(`/${input.adset_id}/insights`, {
          fields: INSIGHT_FIELDS,
          date_preset: input.date_preset,
          level: "ad",
          limit: input.limit,
        })
        .catch((err) => ({ data: [], error: (err as Error).message })),
    ]);
    return {
      ads: (ads as { data?: unknown[] }).data ?? [],
      insights: (insights as { data?: unknown[] }).data ?? [],
      meta_account_label: account.label,
    };
  },
};
