import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { tool as accountsList } from "./tools/accounts.list.js";
import { tool as conversionEventsCreate } from "./tools/conversion_events.create.js";
import { tool as conversionEventsDelete } from "./tools/conversion_events.delete.js";
import { tool as conversionEventsList } from "./tools/conversion_events.list.js";
import { tool as customDimensionsCreate } from "./tools/custom_dimensions.create.js";
import { tool as customDimensionsList } from "./tools/custom_dimensions.list.js";
import { tool as customMetricsCreate } from "./tools/custom_metrics.create.js";
import { tool as customMetricsList } from "./tools/custom_metrics.list.js";
import { tool as dataStreamsList } from "./tools/data_streams.list.js";
import { tool as passthroughRead } from "./tools/passthrough.read.js";
import { tool as passthroughWrite } from "./tools/passthrough.write.js";
import { tool as propertiesGet } from "./tools/properties.get.js";
import { tool as propertiesList } from "./tools/properties.list.js";
import { tool as reportBatch } from "./tools/report.batch.js";
import { tool as reportPivot } from "./tools/report.pivot.js";
import { tool as reportRealtime } from "./tools/report.realtime.js";
import { tool as reportRun } from "./tools/report.run.js";

export function ga4Tools(): ToolDefinition[] {
  return [
    // Reads (11)
    reportRun as ToolDefinition,
    reportRealtime as ToolDefinition,
    reportBatch as ToolDefinition,
    reportPivot as ToolDefinition,
    accountsList as ToolDefinition,
    propertiesList as ToolDefinition,
    propertiesGet as ToolDefinition,
    dataStreamsList as ToolDefinition,
    conversionEventsList as ToolDefinition,
    customDimensionsList as ToolDefinition,
    customMetricsList as ToolDefinition,
    // Writes (4)
    conversionEventsCreate as ToolDefinition,
    conversionEventsDelete as ToolDefinition,
    customDimensionsCreate as ToolDefinition,
    customMetricsCreate as ToolDefinition,
    // Passthrough escape hatches
    passthroughRead as ToolDefinition,
    passthroughWrite as ToolDefinition,
  ];
}
