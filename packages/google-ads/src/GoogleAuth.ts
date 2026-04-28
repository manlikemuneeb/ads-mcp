/**
 * Re-export of the shared GoogleOAuth from core, plus a thin adapter that
 * accepts a GoogleAdsAccount directly to keep call sites compact.
 */
import {
  type GoogleAdsAccount,
  type GoogleFetchLike,
  GoogleOAuth,
} from "@manlikemuneeb/ads-mcp-core";

export type FetchLike = GoogleFetchLike;

export function googleAuthForAdsAccount(
  account: GoogleAdsAccount,
  fetchImpl?: FetchLike,
  now?: () => number,
): GoogleOAuth {
  return new GoogleOAuth(account.oauth_credentials_ref, account.label, fetchImpl, now);
}

// Back-compat: previous code imported `GoogleAuth` directly. Re-export.
export { GoogleOAuth as GoogleAuth };
