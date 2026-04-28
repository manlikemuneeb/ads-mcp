# Spike runbook

> How to run the Phase 0 spikes manually.
> The spikes prove decisions before we commit code in `packages/`.

## Google Ads spike (`spike-google-ads.ts`)

### What it proves

Google Ads REST API works from raw Node, no Python SDK. Confirms or invalidates the locked decision in `project_ads_mcp_decisions` memory.

### Prerequisites

1. Existing OAuth credentials at `~/.config/gcloud/application_default_credentials.json` (the same file `google-ads-mcp` Python pipx uses)
2. Google Ads developer token from Google Ads UI: Settings → Setup → API Center
3. Manager customer ID (`{MCC_ID}`, no dashes)
4. Child customer ID (`{CHILD_ID}`, no dashes)

### Run

```bash
cd /path/to/ads-mcp

export GOOGLE_CREDENTIALS_PATH=~/.config/gcloud/application_default_credentials.json
export GOOGLE_DEVELOPER_TOKEN=<your developer token>
export GOOGLE_LOGIN_CUSTOMER_ID={MCC_ID}
export GOOGLE_CUSTOMER_ID={CHILD_ID}

# tsx is the simplest way to run TypeScript; no build needed
npx -y tsx tests/spike-google-ads.ts
```

### Expected output

```
=== Step 1: load credentials ===
client_id: 12345-abcdef.apps.go...

=== Step 2: refresh access token ===
access_token: ya29.A0ARrdaM...

=== Step 3: minimal GAQL query, version probe ===
SUCCESS at v18: { ... }

=== Step 4: real query at v18 ===
{ ... real campaign data ... }

=== Spike result ===
PASS. Working API version: v18.
Decision: reimplement Google Ads in Node confirmed.
```

### Failure modes and what to do

| Symptom | Likely cause | Fix |
|---|---|---|
| `OAuth refresh failed: 400 invalid_grant` | refresh token expired or revoked | Re-run `gcloud auth application-default login` or regenerate via the original OAuth flow |
| All versions return `developer-token` errors | Developer token missing or unapproved | Apply for basic access in Google Ads UI; takes 1-3 days |
| All versions return 401 | OAuth scope wrong | Confirm `https://www.googleapis.com/auth/adwords` was granted; if not, re-run OAuth flow |
| All versions return 403 with PERMISSION_DENIED | Manager-child link broken | Verify in Google Ads UI that manager `{MCC_ID}` still owns child `{CHILD_ID}` |
| All versions return 404 | Customer ID has dashes | Strip dashes from both manager and child IDs |

### What to do with the result

- If PASS: append a note to `PROGRESS.md` "Google Ads Node spike PASSED at version X. Phase 1 will use this version constant."
- If FAIL on developer token: pause Phase 1 Google Ads work until the user gets basic access. Other platforms can proceed.

## Meta token spike (deferred)

To be added once new Meta token is provisioned by user.

## LinkedIn token spike (deferred)

To be added once new LinkedIn token is provisioned by user.
