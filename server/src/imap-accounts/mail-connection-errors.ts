import { MailServerAddressError } from "./mail-server-address";

/** Stable codes the client maps to translated, actionable messages. */
export const MAIL_CONNECTION_ERROR_CODES = {
  AUTH_FAILED: "auth_failed",
  INVALID_SERVER: "invalid_server",
  CONNECTION_FAILED: "connection_failed",
  CERTIFICATE_MISMATCH: "certificate_mismatch",
  TLS_FAILED: "tls_failed",
  UNKNOWN: "unknown",
} as const;

export type MailConnectionErrorCode =
  (typeof MAIL_CONNECTION_ERROR_CODES)[keyof typeof MAIL_CONNECTION_ERROR_CODES];

export type MailProtocol = "imap" | "smtp";

export interface MailConnectionFailure {
  protocol: MailProtocol;
  code: MailConnectionErrorCode;
  /** Server/library detail for support; never contains the password. */
  detail: string;
}

const SMTP_AUTH_ERROR_CODE = "EAUTH";
const CONNECTION_ERROR_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "ECONNECTION",
  "ESOCKET",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENOTFOUND",
  "EDNS",
]);
/**
 * Shared hosting (cPanel, Crazy Domains) often serves mail.<domain> with the
 * shared server's certificate, so the fix is to use that server's hostname.
 */
const CERTIFICATE_MISMATCH_CODES = new Set(["ERR_TLS_CERT_ALTNAME_INVALID"]);
const TLS_ERROR_CODES = new Set([
  "CERT_HAS_EXPIRED",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "ERR_SSL_WRONG_VERSION_NUMBER",
]);

interface ErrorLike {
  message?: string;
  code?: string;
  authenticationFailed?: boolean;
  cause?: unknown;
}

function asErrorLike(error: unknown): ErrorLike {
  return typeof error === "object" && error !== null
    ? (error as ErrorLike)
    : {};
}

/** TLS failures surface either on the error or on its cause, by library. */
function errorCodes(error: ErrorLike): string[] {
  const cause = asErrorLike(error.cause);
  return [error.code, cause.code].filter((code): code is string => !!code);
}

function classify(error: unknown): MailConnectionErrorCode {
  if (error instanceof MailServerAddressError) {
    return MAIL_CONNECTION_ERROR_CODES.INVALID_SERVER;
  }
  const errorLike = asErrorLike(error);
  const codes = errorCodes(errorLike);
  if (errorLike.authenticationFailed || codes.includes(SMTP_AUTH_ERROR_CODE)) {
    return MAIL_CONNECTION_ERROR_CODES.AUTH_FAILED;
  }
  if (codes.some((code) => CERTIFICATE_MISMATCH_CODES.has(code))) {
    return MAIL_CONNECTION_ERROR_CODES.CERTIFICATE_MISMATCH;
  }
  if (codes.some((code) => TLS_ERROR_CODES.has(code))) {
    return MAIL_CONNECTION_ERROR_CODES.TLS_FAILED;
  }
  if (codes.some((code) => CONNECTION_ERROR_CODES.has(code))) {
    return MAIL_CONNECTION_ERROR_CODES.CONNECTION_FAILED;
  }
  return MAIL_CONNECTION_ERROR_CODES.UNKNOWN;
}

export function describeMailConnectionError(
  protocol: MailProtocol,
  error: unknown,
): MailConnectionFailure {
  const errorLike = asErrorLike(error);
  return {
    protocol,
    code: classify(error),
    detail: errorLike.message || String(error),
  };
}

export function isMailAuthFailure(error: unknown): boolean {
  return classify(error) === MAIL_CONNECTION_ERROR_CODES.AUTH_FAILED;
}
