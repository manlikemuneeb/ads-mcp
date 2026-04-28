import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { z } from "zod";
import { GscClient } from "../GscClient.js";
import { baseInputShape } from "../schemas.js";

const Input = z.object({
  ...baseInputShape,
  site_url: z.string().optional(),
  inspection_url: z.string().min(1),
  language_code: z.string().optional(),
});
type Input = z.infer<typeof Input>;

export const tool: ToolDefinition<Input, unknown> = {
  name: "gsc.url_inspection.inspect",
  description:
    "Inspect a single URL: index status, last crawl, mobile usability, rich results, AMP, and live indexing eligibility.",
  platform: "gsc",
  isWriteTool: false,
  inputSchema: Input,
  handler: async (input, ctx) => {
    const site = ctx.config.getAccount("gsc", input.account);
    const client = new GscClient(site, ctx.rateLimiter);
    const body: Record<string, unknown> = {
      inspectionUrl: input.inspection_url,
      siteUrl: input.site_url ?? site.site_url,
    };
    if (input.language_code) body.languageCode = input.language_code;
    const result = await client.searchconsole("POST", "/urlInspection/index:inspect", body);
    return { ...(result as Record<string, unknown>), gsc_site_label: site.label };
  },
};
