/**
 * Error-message helpers with no framework dependencies, so the shared
 * email-intelligence module (also bundled into the prioritisation Lambda) can
 * use them. types/common re-exports them for existing callers.
 */

/** Shape of API error objects (Google/axios-style) that carry their own message. */
interface ErrorWithMessageFields {
  message?: string;
  error?: string;
}

function hasMessageFields(error: unknown): error is ErrorWithMessageFields {
  return (
    typeof error === "object" &&
    error !== null &&
    ("code" in error || "message" in error || "error" in error)
  );
}

/**
 * Type guard to check if error is a standard Error
 */
export function isError(error: unknown): error is Error {
  return error instanceof Error;
}

/**
 * Safely extract error message from unknown error
 */
export function getErrorMessage(error: unknown): string {
  if (isError(error)) {
    return error.message;
  }
  if (hasMessageFields(error)) {
    return error.message || error.error || "Unknown API error";
  }
  if (typeof error === "string") {
    return error;
  }
  return "Unknown error";
}
