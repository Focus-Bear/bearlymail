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
