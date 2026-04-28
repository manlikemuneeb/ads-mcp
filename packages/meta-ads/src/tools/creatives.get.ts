import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { z } from "zod";
import { MetaClient } from "../MetaClient.js";
import { baseInputShape } from "../schemas.js";

const Input = z.object({
  ...baseInputShape,
  creative_id: z.string().min(1),
});
type Input = z.infer<typeof Input>;

const FIELDS = [
  "id",
  "name",
  "title",
  "body",
  "status",
  "object_type",
  "image_url",
  "thumbnail_url",
  "video_id",
  "image_hash",
  "object_story_spec",
  "asset_feed_spec",
  "call_to_action_type",
  "url_tags",
  "tracking_specs",
  "actor_id",
  "object_url",
  "created_time",
].join(",");

export const tool: ToolDefinition<Input, unknown> = {
  name: "meta.creatives.get",
  description:
    "Fetch a single Meta ad creative by id with full details (object_story_spec, asset_feed_spec, tracking_specs, image/video references). Use before meta.ads.update to inspect what's currently attached.",
  platform: "meta",
  isWriteTool: false,
  inputSchema: Input,
  handler: async (input, ctx) => {
    const account = ctx.config.getAccount("meta", input.account);
    const client = new MetaClient(account, ctx.rateLimiter);
    const result = await client.get(`/${input.creative_id}`, { fields: FIELDS });
    return {
      creative: result,
      meta_account_label: account.label,
    };
  },
};
