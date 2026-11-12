/**
 * Parses the receiving server's `Authentication-Results` header (RFC 8601)
 * into the SPF, DKIM and DMARC outcomes the phishing check uses.
 *
 * Only the topmost header may be trusted: it is the one our mail provider's MX
 * added. Lower ones can be forged by the sender, so callers pass the first
 * `Authentication-Results` header only.
 */

import {
  AUTH_METHODS,
  AUTH_RESULT_VALUES,
  AuthMethod,
  AuthResultValue,
} from "../constants/phishing.constants";

export type SenderAuthResults = Partial<Record<AuthMethod, AuthResultValue>>;

const KNOWN_RESULTS: ReadonlySet<string> = new Set(
  Object.values(AUTH_RESULT_VALUES),
);

function readMethodResult(
  header: string,
  method: AuthMethod,
): AuthResultValue | undefined {
  const match = header.match(new RegExp(`\\b${method}\\s*=\\s*([a-z]+)`, "i"));
  const result = match?.[1].toLowerCase();
  return result && KNOWN_RESULTS.has(result)
    ? (result as AuthResultValue)
    : undefined;
}

/** Returns null when the header is absent or reports none of SPF/DKIM/DMARC. */
export function parseAuthenticationResults(
  header: string | null | undefined,
): SenderAuthResults | null {
  if (!header) return null;
  const results: SenderAuthResults = {};
  for (const method of Object.values(AUTH_METHODS)) {
    const result = readMethodResult(header, method);
    if (result) results[method] = result;
  }
  return Object.keys(results).length > 0 ? results : null;
}

/** "spf=pass, dkim=pass, dmarc=fail" — the form shown to the model. */
export function formatSenderAuthResults(
  results: SenderAuthResults | null | undefined,
): string {
  if (!results) return "";
  return Object.values(AUTH_METHODS)
    .filter((method) => results[method])
    .map((method) => `${method}=${results[method]}`)
    .join(", ");
}

/**
 * True when the sender failed authentication outright: DMARC failed, or SPF
 * failed with no passing DKIM signature to vouch for the message instead.
 */
export function hasSenderAuthFailure(
  results: SenderAuthResults | null | undefined,
): boolean {
  if (!results) return false;
  if (results.dmarc === AUTH_RESULT_VALUES.FAIL) return true;
  return (
    results.spf === AUTH_RESULT_VALUES.FAIL &&
    results.dkim !== AUTH_RESULT_VALUES.PASS
  );
}
