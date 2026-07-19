/**
 * Custom error classes for BearlyMail.
 *
 * Using distinct error classes lets callers use `instanceof` checks
 * instead of brittle string comparisons on error messages.
 */

/**
 * Thrown when an OAuth token is irrecoverably invalid — e.g. the token has
 * been revoked by the user, was issued for a different environment (dev token
 * in prod), or encrypted with a different key.
 *
 * Distinct from an *expired* token, which is recoverable via a refresh.
 * When this error is thrown the user must re-authenticate — there is no point
 * attempting a token refresh or retrying the sync job.
 */
export class InvalidTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidTokenError";
    // Maintain correct prototype chain in transpiled ES5
    Object.setPrototypeOf(this, InvalidTokenError.prototype);
  }
}

/**
 * Thrown when Gmail returns 429 (Too Many Requests) during a sync run.
 *
 * Retrying 429s inside a paginated loop is counter-productive — each retry is
 * another request against the same depleted quota window.  Instead, the whole
 * sync run is aborted and the scheduler will retry the full sync later, once
 * the quota window has reset.
 *
 * `retryAfterSeconds` is populated from the `Retry-After` response header
 * when present, so callers / debug UIs can surface a human-readable hint.
 */
export class GmailRateLimitError extends Error {
  /** Seconds until the quota window resets, from the Retry-After header (or undefined). */
  readonly retryAfterSeconds: number | undefined;

  constructor(message: string, retryAfterSeconds?: number) {
    super(message);
    this.name = "GmailRateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
    Object.setPrototypeOf(this, GmailRateLimitError.prototype);
  }
}
