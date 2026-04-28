import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { tool as searchAnalyticsQuery } from "./tools/search_analytics.query.js";
import { tool as sitemapsDelete } from "./tools/sitemaps.delete.js";
import { tool as sitemapsGet } from "./tools/sitemaps.get.js";
import { tool as sitemapsList } from "./tools/sitemaps.list.js";
import { tool as sitemapsSubmit } from "./tools/sitemaps.submit.js";
import { tool as sitesAdd } from "./tools/sites.add.js";
import { tool as sitesDelete } from "./tools/sites.delete.js";
import { tool as sitesList } from "./tools/sites.list.js";
import { tool as urlInspectionInspect } from "./tools/url_inspection.inspect.js";

export function gscTools(): ToolDefinition[] {
  return [
    sitesList as ToolDefinition,
    sitesAdd as ToolDefinition,
    sitesDelete as ToolDefinition,
    sitemapsList as ToolDefinition,
    sitemapsGet as ToolDefinition,
    sitemapsSubmit as ToolDefinition,
    sitemapsDelete as ToolDefinition,
    searchAnalyticsQuery as ToolDefinition,
    urlInspectionInspect as ToolDefinition,
  ];
}
