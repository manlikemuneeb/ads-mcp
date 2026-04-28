import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { z } from "zod";
import { MetaClient } from "../MetaClient.js";
import { baseInputShape } from "../schemas.js";

const Input = z.object({
  ...baseInputShape,
});
type Input = z.infer<typeof Input>;

const FIELDS = [
  "name",
  "code",
  "creation_time",
  "last_fired_time",
  "is_unavailable",
  "data_use_setting",
  "automatic_matching_fields",
  "first_party_cookie_status",
].join(",");

export const tool: ToolDefinition<Input, unknown> = {
  name: "meta.pixels.list",
  description:
    "List Meta Pixels assigned to the ad account: name, install snippet, last-fired timestamp, and matching settings. Useful before creating custom conversions or attaching tracking_specs.",
  platform: "meta",
  isWriteTool: false,
  inputSchema: Input,
  handler: async (input, ctx) => {
    const account = ctx.config.getAccount("meta", input.account);
    const client = new MetaClient(account, ctx.rateLimiter);
    const acctPath = client.getAccountPath();
    const result = (await client.get(`/${acctPath}/adspixels`, { fields: FIELDS })) as {
      data?: unknown[];
      paging?: unknown;
    };
    return {
      pixels: result.data ?? [],
      paging: result.paging ?? null,
      meta_account_label: account.label,
    };
  },
};
