import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { tool as accountOverview } from "./tools/account.overview.js";
import { tool as adsCreate } from "./tools/ads.create.js";
import { tool as adsDelete } from "./tools/ads.delete.js";
import { tool as adsList } from "./tools/ads.list.js";
import { tool as adsPause } from "./tools/ads.pause.js";
import { tool as adsResume } from "./tools/ads.resume.js";
import { tool as adsUpdate } from "./tools/ads.update.js";
import { tool as adsetsCreate } from "./tools/adsets.create.js";
import { tool as adsetsDelete } from "./tools/adsets.delete.js";
import { tool as adsetsList } from "./tools/adsets.list.js";
import { tool as adsetsPause } from "./tools/adsets.pause.js";
import { tool as adsetsResume } from "./tools/adsets.resume.js";
import { tool as adsetsUpdate } from "./tools/adsets.update.js";
import { tool as adsetsUpdateBudget } from "./tools/adsets.update_budget.js";
import { tool as campaignsCreate } from "./tools/campaigns.create.js";
import { tool as campaignsDelete } from "./tools/campaigns.delete.js";
import { tool as campaignsList } from "./tools/campaigns.list.js";
import { tool as campaignsPause } from "./tools/campaigns.pause.js";
import { tool as campaignsResume } from "./tools/campaigns.resume.js";
import { tool as campaignsUpdate } from "./tools/campaigns.update.js";
import { tool as campaignsUpdateBudget } from "./tools/campaigns.update_budget.js";
import { tool as creativesCreateImage } from "./tools/creatives.create_image.js";
import { tool as creativesGet } from "./tools/creatives.get.js";
import { tool as creativesList } from "./tools/creatives.list.js";
import { tool as customAudiencesCreateLookalike } from "./tools/custom_audiences.create_lookalike.js";
import { tool as customAudiencesCreateSaved } from "./tools/custom_audiences.create_saved.js";
import { tool as customAudiencesDelete } from "./tools/custom_audiences.delete.js";
import { tool as customAudiencesList } from "./tools/custom_audiences.list.js";
import { tool as customConversionsCreate } from "./tools/custom_conversions.create.js";
import { tool as customConversionsList } from "./tools/custom_conversions.list.js";
import { tool as deliveryEstimate } from "./tools/delivery_estimate.js";
import { tool as insightsActionBreakdown } from "./tools/insights.action_breakdown.js";
import { tool as insightsBudgetPacing } from "./tools/insights.budget_pacing.js";
import { tool as insightsCreative } from "./tools/insights.creative.js";
import { tool as insightsDemographics } from "./tools/insights.demographics.js";
import { tool as insightsFunnel } from "./tools/insights.funnel.js";
import { tool as insightsPlacements } from "./tools/insights.placements.js";
import { tool as leadGenFormsGetLeads } from "./tools/lead_gen_forms.get_leads.js";
import { tool as leadGenFormsList } from "./tools/lead_gen_forms.list.js";
import { tool as passthroughRead } from "./tools/passthrough.read.js";
import { tool as passthroughWrite } from "./tools/passthrough.write.js";
import { tool as pixelsList } from "./tools/pixels.list.js";
import { tool as targetingAccountSearch } from "./tools/targeting.account_search.js";
import { tool as targetingBrowse } from "./tools/targeting.browse.js";
import { tool as targetingSearch } from "./tools/targeting.search.js";

/** All Meta tools, read + write. Server merges this with other platform registries. */
export function metaTools(): ToolDefinition[] {
  return [
    // Reads — entities (5)
    accountOverview as ToolDefinition,
    campaignsList as ToolDefinition,
    adsetsList as ToolDefinition,
    adsList as ToolDefinition,
    creativesList as ToolDefinition,
    creativesGet as ToolDefinition,
    // Reads — audiences/tracking/forms (5)
    customAudiencesList as ToolDefinition,
    pixelsList as ToolDefinition,
    customConversionsList as ToolDefinition,
    leadGenFormsList as ToolDefinition,
    leadGenFormsGetLeads as ToolDefinition,
    // Reads — insights (6)
    insightsDemographics as ToolDefinition,
    insightsPlacements as ToolDefinition,
    insightsCreative as ToolDefinition,
    insightsFunnel as ToolDefinition,
    insightsBudgetPacing as ToolDefinition,
    insightsActionBreakdown as ToolDefinition,
    // Reads — planning/estimation (4)
    deliveryEstimate as ToolDefinition,
    targetingSearch as ToolDefinition,
    targetingAccountSearch as ToolDefinition,
    targetingBrowse as ToolDefinition,
    // Writes — campaigns (5)
    campaignsCreate as ToolDefinition,
    campaignsUpdate as ToolDefinition,
    campaignsPause as ToolDefinition,
    campaignsResume as ToolDefinition,
    campaignsUpdateBudget as ToolDefinition,
    campaignsDelete as ToolDefinition,
    // Writes — adsets (6)
    adsetsCreate as ToolDefinition,
    adsetsUpdate as ToolDefinition,
    adsetsPause as ToolDefinition,
    adsetsResume as ToolDefinition,
    adsetsUpdateBudget as ToolDefinition,
    adsetsDelete as ToolDefinition,
    // Writes — ads (5)
    adsCreate as ToolDefinition,
    adsUpdate as ToolDefinition,
    adsPause as ToolDefinition,
    adsResume as ToolDefinition,
    adsDelete as ToolDefinition,
    // Writes — creatives (1)
    creativesCreateImage as ToolDefinition,
    // Writes — audiences (3)
    customAudiencesCreateSaved as ToolDefinition,
    customAudiencesCreateLookalike as ToolDefinition,
    customAudiencesDelete as ToolDefinition,
    // Writes — tracking (1)
    customConversionsCreate as ToolDefinition,
    // Passthrough escape hatches
    passthroughRead as ToolDefinition,
    passthroughWrite as ToolDefinition,
  ];
}
