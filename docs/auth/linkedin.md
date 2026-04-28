# LinkedIn Ads auth

ads-mcp talks to LinkedIn's Marketing API via the `/rest/` endpoint at version `202604`. You need an OAuth access token with the right scopes.

## Required scopes

- `r_ads`
- `r_ads_reporting`
- `rw_ads` (required for write tools)
- `r_organization_social` (helpful for organic context)

**Important:** `rw_ads` may require LinkedIn Marketing Developer Platform partner approval depending on your app's status. Read tools work with `r_ads` alone. If write tools fail with 403 "Permissions: rw_ads required", you may need to apply for partner status.

## Token acquisition

1. Go to https://www.linkedin.com/developers/apps. Create or pick an app.
2. Products tab: add "Marketing Developer Platform" if not already present (review can take a few days for write scopes).
3. Auth tab: take note of `Client ID` and `Client Secret`.
4. Tools → OAuth 2.0 Token Generator (or use the auth code flow):
   - Select all scopes you need (read scopes always available; rw_ads only after partner approval if required for your app)
   - Sign in and authorize
   - Copy the access token (~60 day TTL) and refresh token (~365 day TTL)
5. Paste the access token into `ads-mcp setup` when prompted.

## What "ad_account_id" means

Numeric ID. Find at https://www.linkedin.com/campaignmanager → Account Center → click your account; URL has `accountId=<digits>`.

## Refreshing tokens

LinkedIn issues 60-day access tokens with 365-day refresh tokens. To wire automatic refresh, also collect:
- refresh_token
- client_id
- client_secret

The setup wizard does not yet collect these (Phase 2 work). For v1 you re-run the OAuth flow every ~50 days.

## Troubleshooting

- 401 "PERMISSIONS": missing scope. Regenerate token with the right scopes.
- 403 "PERMISSIONS: rw_ads": write scope not granted. Apply for partner status or use read tools only.
- 429: rate limit. retry-after header is honored.
- LinkedIn-Version error: ads-mcp pins `202604`. If LinkedIn deprecates that version (after April 2027), update `packages/linkedin-ads/src/version.ts`.
