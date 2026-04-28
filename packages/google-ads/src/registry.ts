import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { tool as adGroupsList } from "./tools/ad_groups.list.js";
import { tool as campaignsList } from "./tools/campaigns.list.js";
import { tool as campaignsPause } from "./tools/campaigns.pause.js";
import { tool as campaignsResume } from "./tools/campaigns.resume.js";
import { tool as campaignsUpdateBudget } from "./tools/campaigns.update_budget.js";
import { tool as passthroughMutate } from "./tools/passthrough.write.js";
import { tool as query } from "./tools/query.js";

/** All Google Ads tools, read + write. */
export function googleAdsTools(): ToolDefinition[] {
  return [
    // Reads (3)
    query as ToolDefinition,
    campaignsList as ToolDefinition,
    adGroupsList as ToolDefinition,
    // Writes (3)
    campaignsPause as ToolDefinition,
    campaignsResume as ToolDefinition,
    campaignsUpdateBudget as ToolDefinition,
    // Passthrough escape hatch
    passthroughMutate as ToolDefinition,
  ];
}
