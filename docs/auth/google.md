# Google auth (Ads + GA4 + GSC)

All three Google services share a single OAuth flow: one `credentials.json` file (`authorized_user` shape) covers Google Ads, GA4, and GSC if you grant the right scopes during authorization.

## One-time setup: create the OAuth client

1. Go to https://console.cloud.google.com/. Create or pick a project.
2. APIs & Services → Library → enable:
   - Google Ads API
   - Google Analytics Data API
   - Google Analytics Admin API
   - Google Search Console API
3. APIs & Services → OAuth consent screen → External (or Internal for Workspace). Fill in app name, user support email, developer email. Add scopes:
   - `https://www.googleapis.com/auth/adwords`
   - `https://www.googleapis.com/auth/analytics.readonly`
   - `https://www.googleapis.com/auth/analytics.edit`
   - `https://www.googleapis.com/auth/webmasters`
4. Add yourself as a test user.
5. APIs & Services → Credentials → Create credentials → OAuth client ID → Desktop app.
6. Download the credentials JSON. We'll convert it to `authorized_user` shape next.

## Generate `credentials.json` (authorized_user shape)

Easiest path: install gcloud CLI once and run:

```bash
gcloud auth application-default login \
  --client-id-file=/path/to/downloaded-oauth-client.json \
  --scopes=https://www.googleapis.com/auth/adwords,https://www.googleapis.com/auth/analytics.readonly,https://www.googleapis.com/auth/analytics.edit,https://www.googleapis.com/auth/webmasters
```

This drops a JSON file at `~/.config/gcloud/application_default_credentials.json` with shape:

```json
{
  "type": "authorized_user",
  "client_id": "...",
  "client_secret": "...",
  "refresh_token": "..."
}
```

That's the file ads-mcp wants. Note the absolute path; you'll paste it into `ads-mcp setup` for any/all of the three Google services.

Alternative: build the same JSON manually using the OAuth 2.0 Playground at https://developers.google.com/oauthplayground. Authorize the four scopes, exchange the code for a refresh token, paste into a JSON file matching the shape above.

## Google Ads only: also need a developer token

1. Sign in to https://ads.google.com.
2. Tools & Settings → Setup → API Center.
3. Apply for **Basic** access (sufficient for any normal account; takes 1-3 days for review). Test access works only against test accounts.
4. Once approved, copy the Developer Token. Paste into `ads-mcp setup` when prompted.

## What IDs to provide

- **Google Ads:**
  - `customer_id`: your Google Ads account ID with no dashes
  - `login_customer_id`: optional, your manager (MCC) account ID with no dashes, only when accessing through a manager
- **GA4:**
  - `property_id`: numeric, find at GA4 UI → Admin → Property Settings
- **GSC:**
  - `site_url`: either `sc-domain:example.com` (Domain property) or `https://example.com/` with trailing slash (URL-prefix property), exactly as shown in Search Console

## Token refresh

The credentials.json contains a refresh token; ads-mcp's GoogleOAuth class refreshes access tokens automatically before each call (cached in memory). You don't need to do anything beyond keeping the credentials.json file in place.

## Troubleshooting

- "PERMISSION_DENIED" on Google Ads: developer token tier doesn't allow access to this customer; or you're hitting a child account through the wrong manager. Double-check `login_customer_id`.
- "INVALID_ARGUMENT customer_id has dashes": strip the dashes. ads-mcp setup wizard does this for you.
- GA4 returns "User does not have sufficient permissions": the credentials.json was generated without the analytics scopes. Re-run gcloud auth with all four scopes.
- GSC returns "User does not have permission": the email associated with the credentials must be a verified owner/user of the property in Search Console.
