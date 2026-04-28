import type { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { AuditLogger } from "./AuditLogger.js";
import type { ConfigManager } from "./ConfigManager.js";
import type { DryRunGate } from "./DryRunGate.js";
import type { RateLimiter } from "./RateLimiter.js";
import type { PlatformName } from "./types.js";

/**
 * ToolContext is passed to every tool handler. It bundles the runtime services
 * each tool needs without forcing them through global state.
 */
export interface ToolContext {
  config: ConfigManager;
  rateLimiter: RateLimiter;
  auditLogger: AuditLogger;
  dryRunGate: DryRunGate;
}

/**
 * A ToolDefinition pairs a Zod schema (used for runtime validation AND for
 * generating JSON Schema for MCP `inputSchema`) with a handler.
 *
 * `isWriteTool: true` means the tool may mutate platform state. The DryRunGate
 * checks this before allowing live execution.
 *
 * `platform: "core"` is reserved for non-platform tools like `core.diagnose`.
 */
export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  platform: PlatformName | "core";
  isWriteTool: boolean;
  inputSchema: z.ZodType<TInput, z.ZodTypeDef, unknown>;
  handler: (input: TInput, ctx: ToolContext) => Promise<TOutput>;
}

/**
 * Convert a ToolDefinition to the MCP SDK's expected shape:
 * `{ name, description, inputSchema: <JSON Schema> }`. Server uses this when
 * responding to ListToolsRequest.
 */
export function toMcpToolListEntry(tool: ToolDefinition): {
  name: string;
  description: string;
  inputSchema: object;
} {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: zodToJsonSchema(tool.inputSchema, { target: "openApi3" }) as object,
  };
}

/**
 * Validate input against the tool's Zod schema, then run the handler.
 * Surfaces validation errors with field paths.
 */
export async function callTool(
  tool: ToolDefinition,
  rawInput: unknown,
  ctx: ToolContext,
): Promise<unknown> {
  const parsed = tool.inputSchema.safeParse(rawInput);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid input to ${tool.name}: ${issues}`);
  }
  return tool.handler(parsed.data, ctx);
}
