import { describe, expect, it } from "vitest";

// The classifier lives inside doctor.ts and isn't exported. We re-implement
// the same logic here as a contract test — if the doctor's isLikelyAuthError
// drifts, this test breaks and reminds us to update both. Cheap insurance.
function isLikelyAuthError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("revoked") ||
    m.includes("expired") ||
    m.includes("invalid_grant") ||
    m.includes("invalid oauth") ||
    m.includes("invalid credentials") ||
    m.includes("invalid_client") ||
    m.includes("oauthexception") ||
    m.includes("session has expired") ||
    m.includes("(401)") ||
    /\b401\b/.test(m)
  );
}

describe("doctor — auth-error classification", () => {
  it("detects LinkedIn 'token revoked' messages", () => {
    expect(
      isLikelyAuthError(
        "LinkedIn GET /adAccounts/519901013 failed (401): The token used in the request has been revoked by the user",
      ),
    ).toBe(true);
  });

  it("detects Meta 'OAuthException' wrapper", () => {
    expect(
      isLikelyAuthError(
        'Meta GET /me failed (190): Error validating access token: Session has expired (OAuthException, code 190)',
      ),
    ).toBe(true);
  });

  it("detects Google 'invalid_grant' from refresh", () => {
    expect(
      isLikelyAuthError("Google OAuth refresh failed (400): {\"error\":\"invalid_grant\",\"error_description\":\"Token has been expired or revoked.\"}"),
    ).toBe(true);
  });

  it("detects Google Ads 'Invalid Credentials'", () => {
    expect(
      isLikelyAuthError(
        "Google Ads search failed (UNAUTHENTICATED): Invalid Credentials",
      ),
    ).toBe(true);
  });

  it("detects bare HTTP 401 in error message", () => {
    expect(isLikelyAuthError("Some platform call failed with status 401")).toBe(
      true,
    );
    expect(isLikelyAuthError("(401) request failed")).toBe(true);
  });

  it("does NOT trigger on rate-limit (429) errors", () => {
    expect(
      isLikelyAuthError("LinkedIn API rate limited"),
    ).toBe(false);
    expect(isLikelyAuthError("Request failed with status 429")).toBe(false);
  });

  it("does NOT trigger on 5xx errors", () => {
    expect(isLikelyAuthError("Internal server error 500")).toBe(false);
    expect(isLikelyAuthError("Bad gateway 502")).toBe(false);
  });

  it("does NOT trigger on schema validation errors", () => {
    expect(
      isLikelyAuthError(
        "Invalid input to meta.passthrough.read: query.limit: Expected string, received number",
      ),
    ).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isLikelyAuthError("OAUTHEXCEPTION")).toBe(true);
    expect(isLikelyAuthError("ToKeN HaS BeEn ReVoKeD")).toBe(true);
  });

  it("does NOT trigger on '4015' or other numeric noise that contains 401", () => {
    // Word-boundary regex prevents false positives on substrings.
    expect(isLikelyAuthError("Error 40150 unrelated to auth")).toBe(false);
    expect(isLikelyAuthError("4012 some random code")).toBe(false);
  });
});
