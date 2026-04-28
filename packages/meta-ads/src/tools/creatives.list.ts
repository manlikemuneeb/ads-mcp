import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { z } from "zod";
import { MetaClient } from "../MetaClient.js";
import { baseInputShape } from "../schemas.js";

const Input = z.object({
  ...baseInputShape,
  limit: z.number().int().positive().max(500).default(100),
  after: z.string().optional().describe("Pagination cursor."),
  status_filter: z
    .array(z.enum(["ACTIVE", "DELETED", "WITH_ISSUES", "IN_PROCESS", "WITH_ERRORS"]))
    .optional()
    .describe("Filter creatives by status."),
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
  "created_time",
].join(",");

export const tool: ToolDefinition<Input, unknown> = {
  name: "meta.creatives.list",
  description:
    "List ad creatives in the account library. Returns title, body, image/video reference, and the object_story_spec used to create each creative. Useful before meta.ads.create to find an existing creative to attach.",
  platform: "meta",
  isWriteTool: false,
  inputSchema: Input,
  handler: async (input, ctx) => {
    const account = ctx.config.getAccount("meta", input.account);
    const client = new MetaClient(account, ctx.rateLimiter);
    const acctPath = client.getAccountPath();

    const query: Record<string, string | number | undefined> = {
      fields: FIELDS,
      limit: input.limit,
    };
    if (input.status_filter && input.status_filter.length > 0) {
      query.filtering = JSON.stringify([
        { field: "status", operator: "IN", value: input.status_filter },
      ]);
    }
    if (input.after) query.after = input.after;

    const result = (await client.get(`/${acctPath}/adcreatives`, query)) as {
      data?: unknown[];
      paging?: { cursors?: { after?: string } };
    };
    return {
      creatives: result.data ?? [],
      next_cursor: result.paging?.cursors?.after ?? null,
      meta_account_label: account.label,
    };
  },
};
