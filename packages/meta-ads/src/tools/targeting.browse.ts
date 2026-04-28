import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { z } from "zod";
import { MetaClient } from "../MetaClient.js";
import { baseInputShape } from "../schemas.js";

/**
 * Account-scoped targeting browse — /act_<id>/targetingbrowse?class=<class>.
 *
 * Returns the FULL catalog for a class without a keyword filter. Use this
 * when you want to see everything Meta offers in a category (e.g.
 * "what behaviors are available?", "what life events does Meta track?").
 *
 * Different from meta.targeting.account_search:
 *   - browse returns the full catalog; search returns matches for a keyword
 *   - browse uses `class=` parameter; search uses `type=`
 *   - browse is paginated (response can be large); use limit + after
 *
 * The `class` parameter is genuinely named `class` on this endpoint. Yes,
 * Meta uses both `class` (browse) and `type` (search) on closely-related
 * endpoints — confusing but real.
 */

const Input = z.object({
  ...baseInputShape,
  class: z
    .enum([
      "interests",
      "behaviors",
      "demographics",
      "life_events",
      "family_statuses",
      "industries",
      "income",
      "education_statuses",
      "relationship_statuses",
    ])
    .describe(
      "Targeting class to browse. Returns the full catalog for that class.",
    ),
  limit: z
    .number()
    .int()
    .positive()
    .max(500)
    .default(100)
    .describe(
      "Max results per page. Meta caps at 500. Use the next_cursor returned in the response to page through.",
    ),
  after: z
    .string()
    .optional()
    .describe("Pagination cursor from a prior response's paging.cursors.after."),
});
type Input = z.infer<typeof Input>;

export const tool: ToolDefinition<Input, unknown> = {
  name: "meta.targeting.browse",
  description:
    "Browse the FULL Meta targeting catalog for a class via /act_<id>/targetingbrowse?class=<class>. Use this when you want to enumerate everything Meta offers in a category (full behaviors taxonomy, all life events, every industry, etc.). For keyword-filtered search, use meta.targeting.account_search or meta.targeting.search instead.",
  platform: "meta",
  isWriteTool: false,
  inputSchema: Input,
  handler: async (input, ctx) => {
    const account = ctx.config.getAccount("meta", input.account);
    const client = new MetaClient(account, ctx.rateLimiter);
    const acctPath = client.getAccountPath();
    const query: Record<string, string | number | undefined> = {
      class: input.class,
      limit: input.limit,
    };
    if (input.after) query.after = input.after;
    const result = (await client.get(
      `/${acctPath}/targetingbrowse`,
      query,
    )) as {
      data?: unknown[];
      paging?: { cursors?: { after?: string } };
    };
    return {
      results: result.data ?? [],
      next_cursor: result.paging?.cursors?.after ?? null,
      class: input.class,
      meta_account_label: account.label,
    };
  },
};
