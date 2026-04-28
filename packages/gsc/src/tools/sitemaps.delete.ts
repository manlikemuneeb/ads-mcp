// TECH-DEBT(option-c-tool-quality): no before-state capture; add in Phase 2.
import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { z } from "zod";
import { GscClient, encodeSite } from "../GscClient.js";
import { baseWriteInputShape } from "../schemas.js";
import { audit } from "./_writeUtils.js";

const Input = z.object({
  ...baseWriteInputShape,
  site_url: z.string().optional(),
  sitemap_url: z.string().min(1),
});
type Input = z.infer<typeof Input>;

export const tool: ToolDefinition<Input, unknown> = {
  name: "gsc.sitemaps.delete",
  description: "Remove a sitemap from Search Console. Dry-run by default.",
  platform: "gsc",
  isWriteTool: true,
  inputSchema: Input,
  handler: async (input, ctx) => {
    const site = ctx.config.getAccount("gsc", input.account);
    const decision = ctx.dryRunGate.evaluate({
      toolName: "gsc.sitemaps.delete",
      platform: "gsc",
      accountLabel: site.label,
      isWriteTool: true,
      ...(input.dry_run !== undefined ? { dryRunRequested: input.dry_run } : {}),
    });
    const client = new GscClient(site, ctx.rateLimiter);
    const targetSite = input.site_url ?? site.site_url;
    const params = { site_url: targetSite, sitemap_url: input.sitemap_url };

    if (decision.outcome === "allow_dry_run") {
      await audit(ctx, {
        tool: "gsc.sitemaps.delete",
        account: site.label,
        params,
        dryRun: true,
        outcome: "allow_dry_run",
        resultSummary: `would delete ${input.sitemap_url}`,
      });
      return { outcome: "allow_dry_run", ...params, gsc_site_label: site.label };
    }

    try {
      await client.webmasters(
        "DELETE",
        `/sites/${encodeSite(targetSite)}/sitemaps/${encodeSite(input.sitemap_url)}`,
      );
      await audit(ctx, {
        tool: "gsc.sitemaps.delete",
        account: site.label,
        params,
        dryRun: false,
        outcome: "live_success",
      });
      return { outcome: "live_success", ...params, gsc_site_label: site.label };
    } catch (err) {
      await audit(ctx, {
        tool: "gsc.sitemaps.delete",
        account: site.label,
        params,
        dryRun: false,
        outcome: "live_failure",
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  },
};
