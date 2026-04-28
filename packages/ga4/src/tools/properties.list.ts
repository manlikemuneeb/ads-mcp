import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { z } from "zod";
import { Ga4Client } from "../Ga4Client.js";
import { baseInputShape } from "../schemas.js";

const Input = z.object({
  ...baseInputShape,
  filter: z
    .string()
    .optional()
    .describe(
      "e.g. 'parent:accounts/123'. If omitted, ads-mcp lists all accessible GA4 accounts and fetches properties under each, merging the result.",
    ),
  page_size: z.number().int().positive().max(200).optional(),
  page_token: z.string().optional().describe("Only respected when `filter` is also provided."),
});
type Input = z.infer<typeof Input>;

export const tool: ToolDefinition<Input, unknown> = {
  name: "ga4.properties.list",
  description:
    "List GA4 properties accessible to the authenticated user. The Admin API requires a filter like 'parent:accounts/{accountId}'. When no filter is given, ads-mcp auto-discovers accounts and lists properties for each.",
  platform: "ga4",
  isWriteTool: false,
  inputSchema: Input,
  handler: async (input, ctx) => {
    const property = ctx.config.getAccount("ga4", input.account);
    const client = new Ga4Client(property, ctx.rateLimiter);

    // Explicit filter: pass through.
    if (input.filter) {
      const query: Record<string, string | undefined> = { filter: input.filter };
      if (input.page_size !== undefined) query.pageSize = String(input.page_size);
      if (input.page_token) query.pageToken = input.page_token;
      const result = await client.admin("GET", "/properties", undefined, query);
      return { ...(result as Record<string, unknown>), ga4_property_label: property.label };
    }

    // Auto-discover: list accounts, then properties per account.
    const accountsRes = (await client.admin("GET", "/accounts")) as {
      accounts?: Array<{ name?: string; displayName?: string }>;
    };
    const accounts = accountsRes.accounts ?? [];
    if (accounts.length === 0) {
      return {
        properties: [],
        accounts_searched: 0,
        note: "No accessible GA4 accounts found for these credentials.",
        ga4_property_label: property.label,
      };
    }

    const allProperties: unknown[] = [];
    const errors: Array<{ account: string; error: string }> = [];
    for (const acct of accounts) {
      if (!acct.name) continue;
      try {
        const r = (await client.admin("GET", "/properties", undefined, {
          filter: `parent:${acct.name}`,
        })) as { properties?: unknown[] };
        if (r.properties) {
          for (const p of r.properties) {
            allProperties.push({ ...(p as object), _account_display_name: acct.displayName });
          }
        }
      } catch (err) {
        errors.push({ account: acct.name, error: (err as Error).message });
      }
    }

    return {
      properties: allProperties,
      accounts_searched: accounts.length,
      ...(errors.length > 0 ? { errors } : {}),
      ga4_property_label: property.label,
    };
  },
};
