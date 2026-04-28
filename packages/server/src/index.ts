#!/usr/bin/env node
import {
  AuditLogger,
  ConfigManager,
  DryRunGate,
  RateLimiter,
  type ToolContext,
  type ToolDefinition,
  callTool,
  toMcpToolListEntry,
} from "@manlikemuneeb/ads-mcp-core";
import { ga4Tools } from "@manlikemuneeb/ads-mcp-ga4";
import { googleAdsTools } from "@manlikemuneeb/ads-mcp-google-ads";
import { gscTools } from "@manlikemuneeb/ads-mcp-gsc";
import { linkedinTools } from "@manlikemuneeb/ads-mcp-linkedin";
import { metaTools } from "@manlikemuneeb/ads-mcp-meta";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { diagnose } from "./diagnose.js";

const SERVER_NAME = "ads-mcp";
const SERVER_VERSION = "0.0.1";

/**
 * core.diagnose is special: it operates on the runtime services themselves
 * rather than calling out to a platform. Define inline rather than in a
 * separate package.
 */
function buildCoreDiagnose(): ToolDefinition {
  return {
    name: "core.diagnose",
    description:
      "Diagnostic. Returns server config status, enabled platforms, accounts (no secrets), rate-limit usage. Use to verify install before running platform tools.",
    platform: "core",
    isWriteTool: false,
    inputSchema: z.object({}).strict(),
    handler: async (_input, ctx) => diagnose(ctx.config, ctx.rateLimiter),
  };
}

async function main(): Promise<void> {
  let config: ConfigManager;
  try {
    config = ConfigManager.load();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[ads-mcp] config error: ${msg}\n`);
    process.exit(78);
  }

  const rateLimiter = new RateLimiter();
  const auditLogger = new AuditLogger(config.getAuditLogPath());
  const dryRunGate = new DryRunGate(config);
  const ctx: ToolContext = { config, rateLimiter, auditLogger, dryRunGate };

  // Compose the tool registry
  const tools: ToolDefinition[] = [
    buildCoreDiagnose(),
    ...(config.isPlatformEnabled("meta") ? metaTools() : []),
    ...(config.isPlatformEnabled("linkedin") ? linkedinTools() : []),
    ...(config.isPlatformEnabled("google_ads") ? googleAdsTools() : []),
    ...(config.isPlatformEnabled("ga4") ? ga4Tools() : []),
    ...(config.isPlatformEnabled("gsc") ? gscTools() : []),
  ];
  const toolByName = new Map(tools.map((t) => [t.name, t]));

  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map(toMcpToolListEntry),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = toolByName.get(request.params.name);
    if (!tool) {
      return {
        content: [{ type: "text", text: `Unknown tool: ${request.params.name}` }],
        isError: true,
      };
    }
    try {
      const result = await callTool(tool, request.params.arguments ?? {}, ctx);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: msg }],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`[ads-mcp] fatal: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
