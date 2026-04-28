import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { tool as accountOverview } from "./tools/account.overview.js";
import { tool as analytics } from "./tools/analytics.js";
import { tool as campaignsList } from "./tools/campaigns.list.js";
import { tool as campaignsPause } from "./tools/campaigns.pause.js";
import { tool as campaignsResume } from "./tools/campaigns.resume.js";
import { tool as campaignsUpdateBudget } from "./tools/campaigns.update_budget.js";
import { tool as creativesList } from "./tools/creatives.list.js";
import { tool as creativesPause } from "./tools/creatives.pause.js";
import { tool as creativesResume } from "./tools/creatives.resume.js";
import { tool as passthroughRead } from "./tools/passthrough.read.js";
import { tool as passthroughWrite } from "./tools/passthrough.write.js";

/** All LinkedIn tools, read + write. */
export function linkedinTools(): ToolDefinition[] {
  return [
    // Reads (4)
    accountOverview as ToolDefinition,
    campaignsList as ToolDefinition,
    analytics as ToolDefinition,
    creativesList as ToolDefinition,
    // Writes (5)
    campaignsPause as ToolDefinition,
    campaignsResume as ToolDefinition,
    campaignsUpdateBudget as ToolDefinition,
    creativesPause as ToolDefinition,
    creativesResume as ToolDefinition,
    // Passthrough escape hatches
    passthroughRead as ToolDefinition,
    passthroughWrite as ToolDefinition,
  ];
}
