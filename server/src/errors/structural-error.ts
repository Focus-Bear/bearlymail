/**
 * StructuralError represents errors that are permanent and should not be retried.
 * These are configuration or setup issues that will not be resolved by retrying.
 *
 * Examples:
 * - Missing prompt template files
 * - Invalid configuration
 * - Missing required environment variables
 *
 * Job processors should catch these errors and fail immediately instead of retrying.
 */
export class StructuralError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StructuralError";
    // Maintain proper stack trace for where the error was thrown
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Check if an error is a structural error
   */
  static isStructuralError(error: unknown): error is StructuralError {
    return error instanceof StructuralError;
  }
}
