import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { z } from "zod";
import { GscClient } from "../GscClient.js";
import { baseInputShape } from "../schemas.js";

const Input = z.object({ ...baseInputShape });
type Input = z.infer<typeof Input>;

export const tool: ToolDefinition<Input, unknown> = {
  name: "gsc.sites.list",
  description: "List sites verified for the authenticated account.",
  platform: "gsc",
  isWriteTool: false,
  inputSchema: Input,
  handler: async (input, ctx) => {
    const site = ctx.config.getAccount("gsc", input.account);
    const client = new GscClient(site, ctx.rateLimiter);
    const result = await client.webmasters("GET", "/sites");
    return { ...(result as Record<string, unknown>), gsc_site_label: site.label };
  },
};
