import type { AuditOutcome, ToolContext } from "@manlikemuneeb/ads-mcp-core";

export interface AuditPayload {
  tool: string;
  account: string;
  params: Record<string, unknown>;
  dryRun: boolean;
  outcome: AuditOutcome;
  resultSummary?: string;
  error?: string;
}

export async function audit(ctx: ToolContext, p: AuditPayload): Promise<void> {
  await ctx.auditLogger.log({
    tool: p.tool,
    platform: "google_ads",
    account: p.account,
    params: p.params,
    dry_run: p.dryRun,
    outcome: p.outcome,
    ...(p.resultSummary !== undefined ? { result_summary: p.resultSummary } : {}),
    ...(p.error !== undefined ? { error: p.error } : {}),
  });
}
