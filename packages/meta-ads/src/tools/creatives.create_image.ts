import type { ToolDefinition } from "@manlikemuneeb/ads-mcp-core";
import { z } from "zod";
import { MetaClient } from "../MetaClient.js";
import { baseWriteInputShape } from "../schemas.js";

/**
 * Create an image-ad creative referencing an existing image hash. The image
 * itself must already be uploaded (POST /act_X/adimages — done via Ads Manager
 * UI or via a separate API call we may add later as creatives.upload_image).
 *
 * Video creative creation is intentionally excluded here — it requires
 * multipart upload of the source video, which we'll add separately as
 * creatives.create_video in Phase 2.5.
 */

const CallToActionType = z.enum([
  "LEARN_MORE",
  "SHOP_NOW",
  "SIGN_UP",
  "DOWNLOAD",
  "GET_OFFER",
  "GET_OFFER_VIEW",
  "BOOK_TRAVEL",
  "APPLY_NOW",
  "CONTACT_US",
  "CONTACT",
  "SUBSCRIBE",
  "GET_QUOTE",
  "INSTALL_APP",
  "INSTALL_MOBILE_APP",
  "USE_APP",
  "USE_MOBILE_APP",
  "PLAY_GAME",
  "WATCH_MORE",
  "WATCH_VIDEO",
  "MESSAGE_PAGE",
  "WHATSAPP_MESSAGE",
  "REQUEST_TIME",
  "SEE_MENU",
  "DONATE_NOW",
  "DONATE",
  "CALL_NOW",
  "CALL",
  "BUY_NOW",
  "BUY_TICKETS",
  "ORDER_NOW",
  "GET_DIRECTIONS",
  "OPEN_LINK",
  "FOLLOW_PAGE",
  "FOLLOW_USER",
  "REGISTER_NOW",
  "GET_PROMOTIONS",
  "VOTE_NOW",
  "GET_SHOWTIMES",
  "RAISE_MONEY",
]);

const Input = z.object({
  ...baseWriteInputShape,
  name: z.string().min(1),
  page_id: z
    .string()
    .min(1)
    .describe("Facebook Page ID that publishes the ad."),
  image_hash: z
    .string()
    .min(1)
    .describe(
      "Hash of an already-uploaded image (returned by POST /act_X/adimages). Use the Ads Manager UI or upload via passthrough.write to mint one.",
    ),
  link: z.string().url().describe("Destination URL the ad clicks through to."),
  message: z
    .string()
    .min(1)
    .describe("Primary text shown above the image in the ad."),
  headline: z.string().optional().describe("Bold headline below the image."),
  description: z
    .string()
    .optional()
    .describe("Smaller description text below the headline."),
  call_to_action_type: CallToActionType.default("LEARN_MORE").describe(
    "Call-to-action button label.",
  ),
  // --- URL tracking ----------------------------------------------------
  url_tags: z
    .string()
    .optional()
    .describe(
      "URL parameters appended to the click destination (e.g. 'utm_source=facebook&utm_medium=cpc&utm_campaign=spring_promo'). No leading '?'.",
    ),
  display_link: z
    .string()
    .optional()
    .describe(
      "Optional vanity URL displayed in the ad instead of the actual link (e.g. show 'hachiai.com' while link is 'hachiai.com/lp/spring').",
    ),
  // --- Lead form CTA --------------------------------------------------
  lead_gen_form_id: z
    .string()
    .optional()
    .describe(
      "When call_to_action_type is one of the lead CTAs (SIGN_UP, GET_QUOTE, SUBSCRIBE), the lead gen form ID to attach. The form replaces the link destination.",
    ),
  // --- Instagram identity --------------------------------------------
  instagram_actor_id: z
    .string()
    .optional()
    .describe(
      "Instagram account that publishes the ad on Instagram placements. Required when running ads on Instagram with a different identity than the Facebook page.",
    ),
  use_page_actor_override: z
    .boolean()
    .optional()
    .describe(
      "When true, suppresses the page byline (advanced; mostly for partnership ads).",
    ),
  // --- Branded content -------------------------------------------------
  branded_content_sponsor_page_id: z
    .string()
    .optional()
    .describe(
      "When this ad is paid promotion of branded content, the sponsor page ID. Triggers Meta's branded-content disclosure.",
    ),
  // --- Asset overrides -----------------------------------------------
  thumbnail_url: z
    .string()
    .url()
    .optional()
    .describe("Override the thumbnail URL for this creative."),
  // --- Linked content reference --------------------------------------
  object_url: z
    .string()
    .optional()
    .describe(
      "When promoting an existing post/event/product instead of creating fresh content, the canonical Meta object URL or ID.",
    ),
  // --- Organization ---------------------------------------------------
  adlabels: z.array(z.object({ name: z.string() })).optional(),
  // --- Escape hatch ---------------------------------------------------
  additional_fields: z
    .record(z.unknown())
    .optional()
    .describe(
      "Any additional Meta-supported field (e.g. asset_feed_spec for dynamic creatives, recommender_settings, product_set_id for catalog ads, link_og_id, place_page_set_id). Merged into object_story_spec or top-level body verbatim.",
    ),
});
type Input = z.infer<typeof Input>;

export const tool: ToolDefinition<Input, unknown> = {
  name: "meta.creatives.create_image",
  description:
    "Create a single-image ad creative referencing a previously-uploaded image_hash. Builds a link_data object_story_spec under the hood. Dry-run by default. For video creatives, use passthrough.write until Phase 2.5 adds creatives.create_video.",
  platform: "meta",
  isWriteTool: true,
  inputSchema: Input,
  handler: async (input, ctx) => {
    const account = ctx.config.getAccount("meta", input.account);
    const decision = ctx.dryRunGate.evaluate({
      toolName: "meta.creatives.create_image",
      platform: "meta",
      accountLabel: account.label,
      isWriteTool: true,
      ...(input.dry_run !== undefined ? { dryRunRequested: input.dry_run } : {}),
    });
    const client = new MetaClient(account, ctx.rateLimiter);
    const acctPath = client.getAccountPath();

    const linkData: Record<string, unknown> = {
      image_hash: input.image_hash,
      link: input.link,
      message: input.message,
    };
    if (input.headline !== undefined) linkData.name = input.headline;
    if (input.description !== undefined) linkData.description = input.description;
    if (input.display_link !== undefined) linkData.caption = input.display_link;

    // Build the call-to-action. For lead-form CTAs the value object swaps
    // the link for a lead_gen_form_id reference; otherwise it's a plain link.
    const ctaValue: Record<string, unknown> = {};
    if (input.lead_gen_form_id) {
      ctaValue.lead_gen_form_id = input.lead_gen_form_id;
    } else {
      ctaValue.link = input.link;
    }
    linkData.call_to_action = {
      type: input.call_to_action_type,
      value: ctaValue,
    };

    const objectStorySpec: Record<string, unknown> = {
      page_id: input.page_id,
      link_data: linkData,
    };
    if (input.instagram_actor_id !== undefined)
      objectStorySpec.instagram_actor_id = input.instagram_actor_id;
    if (input.use_page_actor_override !== undefined)
      objectStorySpec.use_page_actor_override = input.use_page_actor_override;
    if (input.branded_content_sponsor_page_id !== undefined)
      objectStorySpec.branded_content_sponsor_page_id =
        input.branded_content_sponsor_page_id;

    const body: Record<string, unknown> = {
      name: input.name,
      object_story_spec: objectStorySpec,
    };
    if (input.url_tags !== undefined) body.url_tags = input.url_tags;
    if (input.thumbnail_url !== undefined) body.thumbnail_url = input.thumbnail_url;
    if (input.object_url !== undefined) body.object_url = input.object_url;
    if (input.adlabels !== undefined) body.adlabels = input.adlabels;
    if (input.additional_fields !== undefined) Object.assign(body, input.additional_fields);

    const params = {
      name: input.name,
      page_id: input.page_id,
      image_hash: input.image_hash,
      link: input.link,
      call_to_action_type: input.call_to_action_type,
    };

    if (decision.outcome === "allow_dry_run") {
      await ctx.auditLogger.log({
        tool: "meta.creatives.create_image",
        platform: "meta",
        account: account.label,
        params,
        dry_run: true,
        outcome: "allow_dry_run",
        result_summary: `would create image creative "${input.name}" linking to ${input.link}`,
      });
      return {
        name: input.name,
        page_id: input.page_id,
        link: input.link,
        outcome: "allow_dry_run",
        meta_account_label: account.label,
      };
    }

    try {
      const result = (await client.post(`/${acctPath}/adcreatives`, body)) as {
        id?: string;
      };
      await ctx.auditLogger.log({
        tool: "meta.creatives.create_image",
        platform: "meta",
        account: account.label,
        params,
        dry_run: false,
        outcome: "live_success",
        result_summary: `created image creative ${result.id ?? "<no id>"} "${input.name}"`,
      });
      return {
        ...(result.id ? { creative_id: result.id } : {}),
        name: input.name,
        page_id: input.page_id,
        link: input.link,
        outcome: "live_success",
        meta_account_label: account.label,
      };
    } catch (err) {
      await ctx.auditLogger.log({
        tool: "meta.creatives.create_image",
        platform: "meta",
        account: account.label,
        params,
        dry_run: false,
        outcome: "live_failure",
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  },
};
