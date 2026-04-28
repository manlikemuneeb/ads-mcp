import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { z } from "zod";
import { MetaClient } from "../MetaClient.js";
import {
  baseInputShape,
  buildInsightsQuery,
  insightsCommonShape,
} from "../schemas.js";

/**
 * Action-type breakdown: split Meta insights by what the user actually did
 * (link click, lead, purchase, video view, etc.). Critical for diagnosing
 * which ads are driving conversions vs awareness vs noise.
 *
 * Sister tool of insights.funnel — this one focuses on the action_type
 * dimension specifically rather than the funnel as a whole.
 */

const FIELDS = [
  "spend",
  "impressions",
  "clicks",
  "actions",
  "cost_per_action_type",
  "action_values",
  "cost_per_unique_click",
  "cost_per_inline_link_click",
].join(",");

const Input = z.object({
  ...baseInputShape,
  ...insightsCommonShape,
  scope: z
    .enum(["account", "campaign", "adset", "ad"])
    .default("account")
    .describe("Aggregation level. 'account' is fastest; 'ad' is most granular."),
  parent_id: z
    .string()
    .optional()
    .describe(
      "When scope is campaign/adset/ad, the ID of the entity. Omit for scope=account.",
    ),
});
type Input = z.infer<typeof Input>;

export const tool: ToolDefinition<Input, unknown> = {
  name: "meta.insights.action_breakdown",
  description:
    "Break Meta insights down by action_type so you see spend and outcomes per conversion event (link clicks, leads, purchases, video views, etc.). Useful for diagnosing which ads drive which actions.",
  platform: "meta",
  isWriteTool: false,
  inputSchema: Input,
  handler: async (input, ctx) => {
    const account = ctx.config.getAccount("meta", input.account);
    const client = new MetaClient(account, ctx.rateLimiter);
    const acctPath = client.getAccountPath();

    let parent: string;
    if (input.scope === "account") {
      parent = acctPath;
    } else {
      if (!input.parent_id) {
        throw new Error(`scope='${input.scope}' requires parent_id`);
      }
      parent = input.parent_id;
    }

    const query: Record<string, string | number | undefined> = {
      fields: FIELDS,
      breakdowns: "action_type",
      ...buildInsightsQuery(input),
    };

    const result = (await client.get(`/${parent}/insights`, query)) as {
      data?: unknown[];
      paging?: unknown;
    };

    return {
      breakdown: "action_type",
      scope: input.scope,
      ...(input.parent_id ? { parent_id: input.parent_id } : {}),
      data: result.data ?? [],
      paging: result.paging ?? null,
      meta_account_label: account.label,
    };
  },
};
