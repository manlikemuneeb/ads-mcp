import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { tool as accountOverview } from "./tools/account.overview.js";
import { tool as adsList } from "./tools/ads.list.js";
import { tool as adsetsList } from "./tools/adsets.list.js";
import { tool as campaignsPause } from "./tools/campaigns.pause.js";
import { tool as campaignsResume } from "./tools/campaigns.resume.js";
import { tool as campaignsUpdateBudget } from "./tools/campaigns.update_budget.js";
import { tool as campaignsList } from "./tools/campaigns.list.js";
import { tool as insightsBudgetPacing } from "./tools/insights.budget_pacing.js";
import { tool as insightsCreative } from "./tools/insights.creative.js";
import { tool as insightsDemographics } from "./tools/insights.demographics.js";
import { tool as insightsFunnel } from "./tools/insights.funnel.js";
import { tool as insightsPlacements } from "./tools/insights.placements.js";
import { tool as passthroughRead } from "./tools/passthrough.read.js";
import { tool as passthroughWrite } from "./tools/passthrough.write.js";

/** All Meta tools, read + write. Server merges this with other platform registries. */
export function metaTools(): ToolDefinition[] {
  return [
    // Reads (9)
    accountOverview as ToolDefinition,
    campaignsList as ToolDefinition,
    adsetsList as ToolDefinition,
    adsList as ToolDefinition,
    insightsDemographics as ToolDefinition,
    insightsPlacements as ToolDefinition,
    insightsCreative as ToolDefinition,
    insightsFunnel as ToolDefinition,
    insightsBudgetPacing as ToolDefinition,
    // Writes (3)
    campaignsPause as ToolDefinition,
    campaignsResume as ToolDefinition,
    campaignsUpdateBudget as ToolDefinition,
    // Passthrough escape hatches (Option C tech debt)
    passthroughRead as ToolDefinition,
    passthroughWrite as ToolDefinition,
  ];
}
