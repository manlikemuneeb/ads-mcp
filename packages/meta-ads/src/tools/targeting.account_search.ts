import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { z } from "zod";
import { MetaClient } from "../MetaClient.js";
import { baseInputShape } from "../schemas.js";

/**
 * Account-scoped targeting search — /act_<id>/targetingsearch?type=<type>&q=<keyword>.
 *
 * Different surface than the global /search endpoint:
 *   - Account-scoped (returns IDs valid for THIS ad account; some
 *     behaviors are partner-restricted to specific accounts).
 *   - Supports the targeting types that the global /search rejects:
 *     behaviors, industries, life_events, demographics, family_statuses,
 *     education_statuses, relationship_statuses, income, geo_market.
 *   - Returns a richer object shape (size estimates,
 *     parent breadcrumb, partner attribution).
 *
 * Note: Meta's parameter for filtering by targeting category on this
 * endpoint is named `type` (not `class`). Earlier versions of this
 * tool used `class` and Meta silently ignored it, returning a mixed
 * all-types response. Fixed in v0.2.0.
 */

const Input = z.object({
  ...baseInputShape,
  q: z
    .string()
    .min(1)
    .describe("Free-text search query (e.g. 'logistics', 'small business')."),
  type: z
    .enum([
      "adinterest",
      "adworkposition",
      "adworkemployer",
      "adeducationschool",
      "adeducationmajor",
      "behaviors",
      "industries",
      "life_events",
      "demographics",
      "family_statuses",
      "education_statuses",
      "relationship_statuses",
      "income",
      "geo_market",
      "geo_locations",
    ])
    .describe(
      "Targeting type to filter by. behaviors / industries / life_events / demographics / family_statuses / education_statuses / relationship_statuses / income live ONLY on this endpoint (not on the global /search). adinterest / adworkposition / adworkemployer / adeducationschool / adeducationmajor work on both endpoints — using them here returns account-scoped results.",
    ),
  limit: z
    .number()
    .int()
    .positive()
    .max(500)
    .default(50)
    .describe("Max results per page; Meta caps at 500 for this endpoint."),
});
type Input = z.infer<typeof Input>;

export const tool: ToolDefinition<Input, unknown> = {
  name: "meta.targeting.account_search",
  description:
    "Search the account-scoped Meta targeting taxonomy via /act_<id>/targetingsearch?type=<type>&q=<keyword>. Use this for behaviors, industries, life_events, demographics, family_statuses, education_statuses, relationship_statuses, income, geo_market — slices that the global /search endpoint does not serve. For broader exploration without a keyword filter, use meta.targeting.browse instead.",
  platform: "meta",
  isWriteTool: false,
  inputSchema: Input,
  handler: async (input, ctx) => {
    const account = ctx.config.getAccount("meta", input.account);
    const client = new MetaClient(account, ctx.rateLimiter);
    const acctPath = client.getAccountPath();
    const result = (await client.get(`/${acctPath}/targetingsearch`, {
      q: input.q,
      type: input.type,
      limit: input.limit,
    })) as { data?: unknown[]; paging?: unknown };
    return {
      results: result.data ?? [],
      paging: result.paging ?? null,
      query: input.q,
      type: input.type,
      meta_account_label: account.label,
    };
  },
};
