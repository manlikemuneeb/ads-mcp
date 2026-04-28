import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { z } from "zod";
import { GscClient, encodeSite } from "../GscClient.js";
import { baseInputShape } from "../schemas.js";

const Input = z.object({
  ...baseInputShape,
  site_url: z.string().optional(),
  sitemap_url: z.string().min(1),
});
type Input = z.infer<typeof Input>;

export const tool: ToolDefinition<Input, unknown> = {
  name: "gsc.sitemaps.get",
  description: "Get details for a specific sitemap.",
  platform: "gsc",
  isWriteTool: false,
  inputSchema: Input,
  handler: async (input, ctx) => {
    const site = ctx.config.getAccount("gsc", input.account);
    const client = new GscClient(site, ctx.rateLimiter);
    const targetSite = input.site_url ?? site.site_url;
    const result = await client.webmasters(
      "GET",
      `/sites/${encodeSite(targetSite)}/sitemaps/${encodeSite(input.sitemap_url)}`,
    );
    return { ...(result as Record<string, unknown>), gsc_site_label: site.label };
  },
};
