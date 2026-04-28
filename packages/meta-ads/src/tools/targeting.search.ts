import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { z } from "zod";
import { MetaClient } from "../MetaClient.js";
import { baseInputShape } from "../schemas.js";

/**
 * Global Meta /search endpoint for the targeting taxonomy slices that
 * support free-text lookup: interests, work positions/employers, schools,
 * majors, geo, and locales.
 *
 * Use this tool — NOT meta.passthrough.read('/search') — when searching
 * the Meta targeting taxonomy. Passthrough requires you to know the
 * supported `type` values; this tool encodes the canonical list as an
 * enum so unsupported types fail at validation rather than at the API.
 *
 * Behaviors, industries, life_events, demographics-by-segment are NOT
 * served by /search; they live on /act_<id>/targetingsearch which is
 * a separate endpoint covered by meta.targeting.account_search.
 */

const Input = z.object({
  ...baseInputShape,
  q: z.string().min(1).describe("Free-text search query (e.g. 'logistics', 'B2B SaaS')."),
  type: z
    .enum([
      "adinterest",
      "adworkposition",
      "adworkemployer",
      "adeducationschool",
      "adeducationmajor",
      "adgeolocation",
      "adcity",
      "adzipcode",
      "adcountry",
      "adcountrygroup",
      "adstate",
      "adlocale",
      "adfamily",
    ])
    .default("adinterest")
    .describe(
      "Targeting taxonomy slice to search via the global /search endpoint. For behaviors / industries / life_events / demographic segments, use meta.targeting.account_search instead — those live on the account-scoped /act_<id>/targetingsearch endpoint.",
    ),
  limit: z.number().int().positive().max(100).default(25),
});
type Input = z.infer<typeof Input>;

export const tool: ToolDefinition<Input, unknown> = {
  name: "meta.targeting.search",
  description:
    "Search Meta's global targeting taxonomy via /search?type=<type>&q=<keyword>. Returns interests, work positions, employers, schools, majors, geo, and locales with their numeric IDs ready to plug into a targeting payload. PREFER this over meta.passthrough.read('/search') — same endpoint, but typed and validated. For behaviors / industries / life_events / demographic segments, use meta.targeting.account_search (a separate account-scoped endpoint).",
  platform: "meta",
  isWriteTool: false,
  inputSchema: Input,
  handler: async (input, ctx) => {
    const account = ctx.config.getAccount("meta", input.account);
    const client = new MetaClient(account, ctx.rateLimiter);
    const result = (await client.get("/search", {
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
