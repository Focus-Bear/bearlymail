import { createHash, timingSafeEqual } from "crypto";

import { MCP_OAUTH } from "../constants/mcp-oauth.constants";

/** RFC 7636 S256: BASE64URL(SHA256(code_verifier)) must equal the challenge. */
export function isValidPkceVerifier(
  codeVerifier: string,
  codeChallenge: string,
): boolean {
  if (!MCP_OAUTH.CODE_VERIFIER_PATTERN.test(codeVerifier)) return false;
  const computed = Buffer.from(
    createHash("sha256").update(codeVerifier).digest("base64url"),
  );
  const expected = Buffer.from(codeChallenge);
  return (
    computed.length === expected.length && timingSafeEqual(computed, expected)
  );
}
