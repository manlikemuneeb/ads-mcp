/**
 * Phase 0 Item 6 spike: validate that Google Ads REST API works from raw Node
 * without the official Python SDK or any other vendor dependency.
 *
 * What this proves: the user's existing OAuth credentials at
 * ~/.config/gcloud/application_default_credentials.json (set up for the patched pipx
 * google-ads-mcp) can authenticate against Google Ads REST directly, and
 * we can run a minimal GAQL query to list customers and one campaign.
 *
 * If this spike succeeds, we lock the decision to reimplement Google Ads in
 * Node and drop the Python pipx dependency permanently.
 *
 * Run:
 *   npx tsx tests/spike-google-ads.ts
 *
 * Required environment:
 *   GOOGLE_CREDENTIALS_PATH=~/.config/gcloud/application_default_credentials.json
 *   GOOGLE_DEVELOPER_TOKEN=<your developer token from Google Ads UI>
 *   GOOGLE_LOGIN_CUSTOMER_ID=<manager_id_no_dashes>   (only when going through a manager)
 *   GOOGLE_CUSTOMER_ID=<child_id_no_dashes>
 *
 * The credentials.json is the file the existing google-ads-mcp uses.
 * Format expected: { "type": "authorized_user", "client_id": "...",
 *                    "client_secret": "...", "refresh_token": "..." }
 *
 * No npm dependencies needed; uses Node's built-in fetch (Node >= 18).
 */

import { readFile } from "node:fs/promises";

interface AuthorizedUser {
  type: "authorized_user";
  client_id: string;
  client_secret: string;
  refresh_token: string;
}

const TOKEN_URL = "https://oauth2.googleapis.com/token";
// Probe newest first. Google Ads ships ~quarterly and sunsets old versions
// after roughly 14 months. As of April 2026, expect current to be in the
// v20-v22 range; older entries kept as fallback.
const ADS_API_VERSION_CANDIDATES = ["v22", "v21", "v20", "v19", "v18", "v17"];

async function loadCredentials(): Promise<AuthorizedUser> {
  const path = process.env.GOOGLE_CREDENTIALS_PATH;
  if (!path) throw new Error("GOOGLE_CREDENTIALS_PATH env var required");
  const raw = await readFile(path, "utf8");
  const parsed = JSON.parse(raw) as AuthorizedUser;
  if (parsed.type !== "authorized_user") {
    throw new Error(`Expected authorized_user credentials, got ${parsed.type}`);
  }
  return parsed;
}

async function refreshAccessToken(creds: AuthorizedUser): Promise<string> {
  const body = new URLSearchParams({
    client_id: creds.client_id,
    client_secret: creds.client_secret,
    refresh_token: creds.refresh_token,
    grant_type: "refresh_token",
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OAuth refresh failed: ${res.status} ${errText}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  return json.access_token;
}

async function tryGaqlQuery(
  version: string,
  accessToken: string,
  developerToken: string,
  loginCustomerId: string,
  customerId: string,
  query: string,
): Promise<unknown> {
  const url = `https://googleads.googleapis.com/${version}/customers/${customerId}/googleAds:search`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "developer-token": developerToken,
      "login-customer-id": loginCustomerId,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Google Ads ${version} returned ${res.status}: ${text}`);
  }
  return JSON.parse(text);
}

async function main() {
  const developerToken = process.env.GOOGLE_DEVELOPER_TOKEN;
  const loginCustomerId = process.env.GOOGLE_LOGIN_CUSTOMER_ID;
  const customerId = process.env.GOOGLE_CUSTOMER_ID;

  if (!developerToken) throw new Error("GOOGLE_DEVELOPER_TOKEN env var required");
  if (!loginCustomerId) throw new Error("GOOGLE_LOGIN_CUSTOMER_ID env var required");
  if (!customerId) throw new Error("GOOGLE_CUSTOMER_ID env var required");

  console.log("=== Step 1: load credentials ===");
  const creds = await loadCredentials();
  console.log("client_id:", creds.client_id.slice(0, 20) + "...");

  console.log("\n=== Step 2: refresh access token ===");
  const accessToken = await refreshAccessToken(creds);
  console.log("access_token:", accessToken.slice(0, 20) + "...");

  console.log("\n=== Step 3: minimal GAQL query, version probe ===");
  const query = "SELECT customer.id, customer.descriptive_name FROM customer LIMIT 1";

  let workingVersion: string | null = null;
  for (const v of ADS_API_VERSION_CANDIDATES) {
    try {
      const result = await tryGaqlQuery(
        v,
        accessToken,
        developerToken,
        loginCustomerId,
        customerId,
        query,
      );
      console.log(`SUCCESS at ${v}:`, JSON.stringify(result, null, 2).slice(0, 500));
      workingVersion = v;
      break;
    } catch (err) {
      const msg = (err as Error).message;
      // Trim HTML 404 noise to one line for readability
      const oneLine = msg.includes("<!DOCTYPE html>")
        ? `404 (version path not recognized by Google's frontend; likely sunset)`
        : msg.slice(0, 200);
      console.log(`FAILED at ${v}: ${oneLine}`);
    }
  }

  if (!workingVersion) {
    console.error("\nAll candidate versions failed. Either developer token is wrong, OAuth scope is missing, or all listed versions are deprecated.");
    process.exit(1);
  }

  console.log(`\n=== Step 4: real query at ${workingVersion} ===`);
  const campaignQuery = `
    SELECT campaign.id, campaign.name, campaign.status,
           metrics.impressions, metrics.clicks, metrics.cost_micros
    FROM campaign
    WHERE segments.date DURING LAST_7_DAYS
    ORDER BY metrics.impressions DESC
    LIMIT 5
  `.trim();

  const campaigns = await tryGaqlQuery(
    workingVersion,
    accessToken,
    developerToken,
    loginCustomerId,
    customerId,
    campaignQuery,
  );
  console.log(JSON.stringify(campaigns, null, 2));

  console.log("\n=== Spike result ===");
  console.log(`PASS. Working API version: ${workingVersion}.`);
  console.log("Decision: reimplement Google Ads in Node confirmed.");
  console.log("Lock this version constant in packages/google-ads/src/version.ts.");
}

main().catch((err) => {
  console.error("Spike failed:", err);
  process.exit(1);
});
