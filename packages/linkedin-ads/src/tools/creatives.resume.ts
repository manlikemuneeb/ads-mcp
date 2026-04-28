import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { z } from "zod";
import { LinkedInClient } from "../LinkedInClient.js";
import { baseWriteInputShape } from "../schemas.js";
import { audit } from "./_writeUtils.js";

const Input = z.object({
  ...baseWriteInputShape,
  creative_id: z.string().min(1).describe("LinkedIn creative ID (numeric or URN suffix)."),
});
type Input = z.infer<typeof Input>;

interface Output {
  creative_id: string;
  previous_status?: string;
  new_status: "ACTIVE";
  outcome: "allow_dry_run" | "live_success" | "live_failure";
  linkedin_account_label: string;
}

export const tool: ToolDefinition<Input, Output> = {
  name: "linkedin.creatives.resume",
  description:
    "Resume a paused LinkedIn ad creative by PARTIAL_UPDATE to status=ACTIVE. Dry-run by default.",
  platform: "linkedin",
  isWriteTool: true,
  inputSchema: Input,
  handler: async (input, ctx) => {
    const account = ctx.config.getAccount("linkedin", input.account);
    const decision = ctx.dryRunGate.evaluate({
      toolName: "linkedin.creatives.resume",
      platform: "linkedin",
      accountLabel: account.label,
      isWriteTool: true,
      ...(input.dry_run !== undefined ? { dryRunRequested: input.dry_run } : {}),
    });
    const client = new LinkedInClient(account, ctx.rateLimiter);
    const path = `/adAccounts/${account.ad_account_id}/creatives/${input.creative_id}`;

    let previousStatus: string | undefined;
    try {
      const data = (await client.get(path)) as { status?: string };
      previousStatus = data.status;
    } catch {
      previousStatus = undefined;
    }

    if (decision.outcome === "allow_dry_run") {
      await audit(ctx, {
        tool: "linkedin.creatives.resume",
        account: account.label,
        params: { creative_id: input.creative_id },
        dryRun: true,
        outcome: "allow_dry_run",
        resultSummary: `would resume creative ${input.creative_id} (was ${previousStatus ?? "unknown"})`,
      });
      return {
        creative_id: input.creative_id,
        ...(previousStatus !== undefined ? { previous_status: previousStatus } : {}),
        new_status: "ACTIVE",
        outcome: "allow_dry_run",
        linkedin_account_label: account.label,
      };
    }

    try {
      await client.partialUpdate(path, { status: "ACTIVE" });
      await audit(ctx, {
        tool: "linkedin.creatives.resume",
        account: account.label,
        params: { creative_id: input.creative_id },
        dryRun: false,
        outcome: "live_success",
      });
      return {
        creative_id: input.creative_id,
        ...(previousStatus !== undefined ? { previous_status: previousStatus } : {}),
        new_status: "ACTIVE",
        outcome: "live_success",
        linkedin_account_label: account.label,
      };
    } catch (err) {
      await audit(ctx, {
        tool: "linkedin.creatives.resume",
        account: account.label,
        params: { creative_id: input.creative_id },
        dryRun: false,
        outcome: "live_failure",
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  },
};
