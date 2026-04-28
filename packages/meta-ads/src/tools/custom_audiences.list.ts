import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { z } from "zod";
import { MetaClient } from "../MetaClient.js";
import { baseInputShape } from "../schemas.js";

const Input = z.object({
  ...baseInputShape,
  limit: z.number().int().positive().max(500).default(100),
  after: z.string().optional().describe("Pagination cursor."),
  subtype_filter: z
    .array(
      z.enum([
        "WEBSITE",
        "APP",
        "ENGAGEMENT",
        "VIDEO",
        "OFFLINE_CONVERSION",
        "LOOKALIKE",
        "BAG_OF_ACCOUNTS",
        "CUSTOM",
        "PARTNER",
        "MANAGED",
      ]),
    )
    .optional()
    .describe(
      "Filter audiences by subtype. Useful when you want to see only lookalikes or only website audiences.",
    ),
});
type Input = z.infer<typeof Input>;

const FIELDS = [
  "name",
  "subtype",
  "approximate_count_lower_bound",
  "approximate_count_upper_bound",
  "delivery_status",
  "operation_status",
  "rule",
  "data_source",
  "retention_days",
  "time_created",
  "time_updated",
].join(",");

export const tool: ToolDefinition<Input, unknown> = {
  name: "meta.custom_audiences.list",
  description:
    "List Meta custom audiences for an account: saved audiences, lookalikes, customer-list audiences, retargeting audiences. Returns size estimate, type, and freshness per audience.",
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
    if (input.subtype_filter && input.subtype_filter.length > 0) {
      query.filtering = JSON.stringify([
        { field: "subtype", operator: "IN", value: input.subtype_filter },
      ]);
    }
    if (input.after) query.after = input.after;

    const result = (await client.get(
      `/${acctPath}/customaudiences`,
      query,
    )) as {
      data?: unknown[];
      paging?: { cursors?: { after?: string } };
    };
    return {
      custom_audiences: result.data ?? [],
      next_cursor: result.paging?.cursors?.after ?? null,
      meta_account_label: account.label,
    };
  },
};
