import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { z } from "zod";
import { MetaClient } from "../MetaClient.js";
import { baseInputShape } from "../schemas.js";

const Input = z.object({
  ...baseInputShape,
  limit: z.number().int().positive().max(500).default(100),
  after: z.string().optional().describe("Pagination cursor."),
  include_archived: z
    .boolean()
    .default(false)
    .describe(
      "When true, includes archived custom conversions. Default excludes them.",
    ),
});
type Input = z.infer<typeof Input>;

const FIELDS = [
  "name",
  "description",
  "rule",
  "custom_event_type",
  "default_conversion_value",
  "creation_time",
  "first_fired_time",
  "last_fired_time",
  "event_source_id",
  "is_archived",
].join(",");

export const tool: ToolDefinition<Input, unknown> = {
  name: "meta.custom_conversions.list",
  description:
    "List custom conversions defined on the ad account, including the matching rule, event type, and last-fired timestamp. Custom conversions are derived from pixel events plus URL/event-parameter rules.",
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
    if (!input.include_archived) {
      query.filtering = JSON.stringify([
        { field: "is_archived", operator: "EQUAL", value: false },
      ]);
    }
    if (input.after) query.after = input.after;

    const result = (await client.get(
      `/${acctPath}/customconversions`,
      query,
    )) as {
      data?: unknown[];
      paging?: { cursors?: { after?: string } };
    };
    return {
      custom_conversions: result.data ?? [],
      next_cursor: result.paging?.cursors?.after ?? null,
      meta_account_label: account.label,
    };
  },
};
