import { isApiError, ApiError } from "../types/common";

/**
 * Classifies errors and generates user-friendly error messages
 */
export function classifyContextAnalysisError(error: unknown): string {
  // Check for API errors (Gmail API, etc.)
  if (isApiError(error)) {
    const status =
      (error as any).response?.status || (error as any).status || error.code;

    // Authentication errors (401, 403)
    if (
      status === 401 ||
      status === 403 ||
      status === "401" ||
      status === "403"
    ) {
      return "Your email account needs to be reconnected. Please go to Settings and reconnect your account.";
    }

    // Rate limit errors (429)
    if (status === 429 || status === "429") {
      return "Too many requests. Please try again in a few minutes.";
    }

    // Server errors (502, 503, 504) - Gmail API temporarily unavailable
    if (
      status === 502 ||
      status === 503 ||
      status === 504 ||
      status === "502" ||
      status === "503" ||
      status === "504"
    ) {
      return "Email API is temporarily unavailable. Please try again in a few minutes.";
    }

    // Other API errors
    const apiError = error as ApiError;
    const errorMessage =
      apiError.message || apiError.error || "Unknown API error";

    // Check for common Gmail API error patterns
    if (
      errorMessage.toLowerCase().includes("token") ||
      errorMessage.toLowerCase().includes("authentication") ||
      errorMessage.toLowerCase().includes("unauthorized")
    ) {
      return "Your email account needs to be reconnected. Please go to Settings and reconnect your account.";
    }

    if (
      errorMessage.toLowerCase().includes("rate limit") ||
      errorMessage.toLowerCase().includes("quota")
    ) {
      return "Too many requests. Please try again in a few minutes.";
    }

    // Generic API error
    return `Email API error: ${errorMessage}. Please try again later.`;
  }

  // Check for standard Error objects
  if (error instanceof Error) {
    const errorMessage = error.message.toLowerCase();

    // Check for authentication/token errors
    if (
      errorMessage.includes("token") ||
      errorMessage.includes("authentication") ||
      errorMessage.includes("unauthorized") ||
      (errorMessage.includes("missing") && errorMessage.includes("token")) ||
      errorMessage.includes("access token missing") ||
      errorMessage.includes("please log in again")
    ) {
      return "Your email account needs to be reconnected. Please go to Settings and reconnect your account.";
    }

    // Check for network errors
    if (
      errorMessage.includes("network") ||
      errorMessage.includes("connection") ||
      errorMessage.includes("timeout") ||
      errorMessage.includes("econnrefused") ||
      errorMessage.includes("enotfound")
    ) {
      return "Connection error. Please check your internet connection and try again.";
    }

    // Check for rate limit errors
    if (
      errorMessage.includes("rate limit") ||
      errorMessage.includes("quota") ||
      errorMessage.includes("too many requests")
    ) {
      return "Too many requests. Please try again in a few minutes.";
    }

    // Generic error message
    return `An unexpected error occurred: ${error.message}. Please try again later or contact support if the problem persists.`;
  }

  // Fallback for unknown error types
  return "An unexpected error occurred. Please try again later or contact support if the problem persists.";
}
