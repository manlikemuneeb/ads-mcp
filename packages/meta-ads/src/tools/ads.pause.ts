import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { z } from "zod";
import { MetaClient } from "../MetaClient.js";
import { baseWriteInputShape } from "../schemas.js";

const Input = z.object({
  ...baseWriteInputShape,
  ad_id: z.string().min(1).describe("Meta ad ID."),
});
type Input = z.infer<typeof Input>;

interface Output {
  ad_id: string;
  previous_status?: string;
  new_status: "PAUSED";
  outcome: "allow_dry_run" | "live_success" | "live_failure";
  meta_account_label: string;
}

export const tool: ToolDefinition<Input, Output> = {
  name: "meta.ads.pause",
  description:
    "Pause a Meta ad by setting status to PAUSED. Reversible via meta.ads.resume. Common operation for stopping low-performing creatives. Dry-run by default.",
  platform: "meta",
  isWriteTool: true,
  inputSchema: Input,
  handler: async (input, ctx) => {
    const account = ctx.config.getAccount("meta", input.account);
    const decision = ctx.dryRunGate.evaluate({
      toolName: "meta.ads.pause",
      platform: "meta",
      accountLabel: account.label,
      isWriteTool: true,
      ...(input.dry_run !== undefined ? { dryRunRequested: input.dry_run } : {}),
    });

    const client = new MetaClient(account, ctx.rateLimiter);
    let previousStatus: string | undefined;
    try {
      const data = (await client.get(`/${input.ad_id}`, {
        fields: "status,effective_status",
      })) as { status?: string; effective_status?: string };
      previousStatus = data.status ?? data.effective_status;
    } catch {
      previousStatus = undefined;
    }

    if (decision.outcome === "allow_dry_run") {
      await ctx.auditLogger.log({
        tool: "meta.ads.pause",
        platform: "meta",
        account: account.label,
        params: { ad_id: input.ad_id },
        dry_run: true,
        outcome: "allow_dry_run",
        result_summary: `would pause ad ${input.ad_id} (was ${previousStatus ?? "unknown"})`,
      });
      return {
        ad_id: input.ad_id,
        ...(previousStatus !== undefined ? { previous_status: previousStatus } : {}),
        new_status: "PAUSED",
        outcome: "allow_dry_run",
        meta_account_label: account.label,
      };
    }

    try {
      await client.post(`/${input.ad_id}`, { status: "PAUSED" });
      await ctx.auditLogger.log({
        tool: "meta.ads.pause",
        platform: "meta",
        account: account.label,
        params: { ad_id: input.ad_id },
        dry_run: false,
        outcome: "live_success",
        result_summary: `paused ad ${input.ad_id}`,
      });
      return {
        ad_id: input.ad_id,
        ...(previousStatus !== undefined ? { previous_status: previousStatus } : {}),
        new_status: "PAUSED",
        outcome: "live_success",
        meta_account_label: account.label,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await ctx.auditLogger.log({
        tool: "meta.ads.pause",
        platform: "meta",
        account: account.label,
        params: { ad_id: input.ad_id },
        dry_run: false,
        outcome: "live_failure",
        error: msg,
      });
      throw err;
    }
  },
};
