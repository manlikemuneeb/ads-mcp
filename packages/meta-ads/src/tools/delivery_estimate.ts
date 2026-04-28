import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { z } from "zod";
import { MetaClient } from "../MetaClient.js";
import { baseInputShape } from "../schemas.js";

/**
 * Reach/delivery estimate for a proposed targeting payload before launching.
 * Useful sanity check: would this audience be too narrow? Will it spend the
 * full budget? Returns audience size estimate plus expected daily reach.
 */

const Input = z.object({
  ...baseInputShape,
  targeting: z
    .record(z.unknown())
    .describe(
      "Same targeting payload you'd pass to meta.adsets.create. Pass-through to Meta.",
    ),
  optimization_goal: z
    .enum([
      "REACH",
      "IMPRESSIONS",
      "LINK_CLICKS",
      "OFFSITE_CONVERSIONS",
      "POST_ENGAGEMENT",
      "VIDEO_VIEWS",
      "LEAD_GENERATION",
      "LANDING_PAGE_VIEWS",
      "VALUE",
      "APP_INSTALLS",
    ])
    .default("REACH"),
});
type Input = z.infer<typeof Input>;

export const tool: ToolDefinition<Input, unknown> = {
  name: "meta.delivery_estimate",
  description:
    "Get Meta's reach estimate for a proposed targeting + optimization goal before creating an ad set. Returns daily/monthly reach bounds and audience size. Useful sanity check on whether targeting is too narrow.",
  platform: "meta",
  isWriteTool: false,
  inputSchema: Input,
  handler: async (input, ctx) => {
    const account = ctx.config.getAccount("meta", input.account);
    const client = new MetaClient(account, ctx.rateLimiter);
    const acctPath = client.getAccountPath();
    // Meta's GET endpoint expects targeting_spec as a JSON string in the query.
    const result = await client.get(`/${acctPath}/delivery_estimate`, {
      targeting_spec: JSON.stringify(input.targeting),
      optimization_goal: input.optimization_goal,
    });
    return {
      estimate: result,
      optimization_goal: input.optimization_goal,
      meta_account_label: account.label,
    };
  },
};
