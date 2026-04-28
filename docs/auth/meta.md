# Meta (Facebook/Instagram Ads) auth

ads-mcp talks to Meta's Marketing API via Graph v25.0. You need a long-lived user access token with the right scopes.

## Required scopes

- `ads_read`
- `ads_management`
- `business_management`

## Token acquisition (Phase 1 token-paste flow)

1. Go to https://developers.facebook.com/apps and select your app (create one if needed; it must be in "Live" mode for production tokens).
2. Tools → Graph API Explorer.
3. App selector at top: pick the app from step 1.
4. User or Page dropdown: select **User Token** for your account.
5. Add the three scopes above. Click "Generate Access Token". Sign in and approve.
6. The token shown is short-lived (~2 hours). To exchange for a long-lived one (~60 days), call:

   ```bash
   curl "https://graph.facebook.com/v25.0/oauth/access_token?grant_type=fb_exchange_token&client_id=APP_ID&client_secret=APP_SECRET&fb_exchange_token=SHORT_LIVED_TOKEN"
   ```

   The response contains `access_token` (long-lived) and `expires_in` in seconds.
7. Paste the long-lived token into `ads-mcp setup` when prompted.

## What "ad_account_id" means

It's the numeric id with or without the `act_` prefix. ads-mcp normalizes either form. Find it at https://business.facebook.com → Business Settings → Accounts → Ad Accounts → click your account; the URL contains `act_<digits>`.

## Refreshing tokens automatically (Phase 2)

ads-mcp can refresh long-lived tokens if you also store `app_id` and `app_secret`. The setup wizard does not yet collect these; for v1 you re-run the exchange manually every ~50 days. Phase 2 OAuth wizard automates this.

## Troubleshooting

- 190 "Invalid OAuth access token": token expired or wrong app. Regenerate.
- 100 "Invalid parameter" with "User must have ads_read permission": missing scopes during token generation. Regenerate with all three scopes.
- 17 / 4 / 32 / 613: rate limit. ads-mcp surfaces these as RateLimitedError; wait the suggested duration.
