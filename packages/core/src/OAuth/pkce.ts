import { createHash, randomBytes } from "node:crypto";

/**
 * PKCE (RFC 7636) helpers.
 *
 * verifier: 43-128 char URL-safe random string
 * challenge: BASE64URL(SHA256(verifier))
 *
 * The verifier never leaves the local machine; only the challenge goes on
 * the authorize URL. The verifier is sent on token exchange so the provider
 * can confirm it hashes back to the challenge it saw earlier.
 */

export interface PkcePair {
  verifier: string;
  challenge: string;
  method: "S256";
}

export function generatePkcePair(): PkcePair {
  // 32 bytes of entropy -> 43-char URL-safe string after base64url.
  const verifier = base64UrlEncode(randomBytes(32));
  const challenge = base64UrlEncode(
    createHash("sha256").update(verifier).digest(),
  );
  return { verifier, challenge, method: "S256" };
}

export function generateState(): string {
  // 16 bytes is plenty for CSRF protection and keeps the URL short.
  return base64UrlEncode(randomBytes(16));
}

function base64UrlEncode(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}
