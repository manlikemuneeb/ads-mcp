import type { ConfigManager } from "./ConfigManager.js";
import { type PlatformName, WriteDeniedError } from "./types.js";

export interface GateInput {
  toolName: string;
  platform: PlatformName;
  accountLabel: string;
  /** True when the tool is a known write/mutation tool. */
  isWriteTool: boolean;
  /** Caller-provided dry_run flag; when omitted, default is config-controlled. */
  dryRunRequested?: boolean;
}

export type GateDecision =
  | { outcome: "allow_dry_run"; effectiveDryRun: true }
  | { outcome: "allow_live"; effectiveDryRun: false }
  | { outcome: "allow_read"; effectiveDryRun: false };

/**
 * DryRunGate decides whether a tool call may proceed live or must be downgraded
 * to dry-run, and surfaces a structured outcome for AuditLogger.
 *
 * Rules:
 *   - Read tools: always allow_read (no dry-run concept).
 *   - Write tools, dry_run requested true: allow_dry_run.
 *   - Write tools, dry_run requested false:
 *       - account.mode === "read_write" → allow_live
 *       - account.mode === "read" → throw WriteDeniedError(account_read_only)
 *   - Write tools, dry_run not provided:
 *       - config.default_dry_run === true → allow_dry_run
 *       - config.default_dry_run === false AND account.mode === "read_write" → allow_live
 *       - else → throw WriteDeniedError(dry_run_required)
 */
export class DryRunGate {
  constructor(private readonly config: ConfigManager) {}

  evaluate(input: GateInput): GateDecision {
    if (!input.isWriteTool) {
      return { outcome: "allow_read", effectiveDryRun: false };
    }

    const writeAllowed = this.config.isWriteAllowed(input.platform, input.accountLabel);

    if (input.dryRunRequested === true) {
      return { outcome: "allow_dry_run", effectiveDryRun: true };
    }

    if (input.dryRunRequested === false) {
      if (!writeAllowed) {
        throw new WriteDeniedError(
          `Live write blocked: account '${input.accountLabel}' on platform '${input.platform}' is in read-only mode. Flip mode to 'read_write' in config to enable.`,
          "account_read_only",
        );
      }
      return { outcome: "allow_live", effectiveDryRun: false };
    }

    // dry_run not provided: fall through to default
    if (this.config.getDefaultDryRun()) {
      return { outcome: "allow_dry_run", effectiveDryRun: true };
    }

    if (!writeAllowed) {
      throw new WriteDeniedError(
        `Live write blocked: default_dry_run is false but account '${input.accountLabel}' on platform '${input.platform}' is read-only.`,
        "account_read_only",
      );
    }
    return { outcome: "allow_live", effectiveDryRun: false };
  }
}
