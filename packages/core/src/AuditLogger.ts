import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { PlatformName } from "./types.js";

export type AuditOutcome =
  | "allow_dry_run"
  | "allow_live"
  | "deny_account_read_only"
  | "deny_dry_run_required"
  | "deny_tool_not_writable"
  | "live_success"
  | "live_failure";

export interface AuditEntry {
  ts: string; // ISO 8601
  tool: string;
  platform: PlatformName;
  account: string;
  params: Record<string, unknown>;
  dry_run: boolean;
  outcome: AuditOutcome;
  result_summary?: string;
  error?: string;
}

/**
 * Append-only JSON-lines audit log. One file, one entry per line, never
 * truncated by this code. Rotation is the user's responsibility (logrotate
 * or similar) to keep the API simple.
 */
export class AuditLogger {
  private writePromise: Promise<void> = Promise.resolve();

  constructor(private readonly logPath: string) {}

  async log(entry: Omit<AuditEntry, "ts"> & { ts?: string }): Promise<void> {
    const fullEntry: AuditEntry = {
      ts: entry.ts ?? new Date().toISOString(),
      tool: entry.tool,
      platform: entry.platform,
      account: entry.account,
      params: entry.params,
      dry_run: entry.dry_run,
      outcome: entry.outcome,
      ...(entry.result_summary !== undefined ? { result_summary: entry.result_summary } : {}),
      ...(entry.error !== undefined ? { error: entry.error } : {}),
    };
    const line = `${JSON.stringify(fullEntry)}\n`;

    // Serialize writes so concurrent calls don't interleave bytes.
    this.writePromise = this.writePromise.then(async () => {
      await mkdir(dirname(this.logPath), { recursive: true });
      await appendFile(this.logPath, line, "utf8");
    });
    await this.writePromise;
  }

  /** Wait for any in-flight writes to settle. Useful in tests. */
  async flush(): Promise<void> {
    await this.writePromise;
  }
}
