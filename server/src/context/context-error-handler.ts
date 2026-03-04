import { HTTP_STATUS } from "../constants/http-status";
import { ApiError, isApiError } from "../types/common";

const AUTH_ERROR_MSG =
  "Your email account needs to be reconnected. Please go to Settings and reconnect your account.";
const RATE_LIMIT_MSG = "Too many requests. Please try again in a few minutes.";

function classifyApiError(error: ApiError): string {
  const status = error.response?.status || error.status || error.code;
  if (
    status === HTTP_STATUS.UNAUTHORIZED ||
    status === HTTP_STATUS.FORBIDDEN ||
    status === "401" ||
    status === "403"
  )
    return AUTH_ERROR_MSG;
  if (status === HTTP_STATUS.TOO_MANY_REQUESTS || status === "429")
    return RATE_LIMIT_MSG;
  if (
    status === HTTP_STATUS.BAD_GATEWAY ||
    status === HTTP_STATUS.SERVICE_UNAVAILABLE ||
    status === HTTP_STATUS.GATEWAY_TIMEOUT ||
    status === "502" ||
    status === "503" ||
    status === "504"
  ) {
    return "Email API is temporarily unavailable. Please try again in a few minutes.";
  }
  const errorMessage = (
    error.message ||
    error.error ||
    "Unknown API error"
  ).toLowerCase();
  if (
    errorMessage.includes("token") ||
    errorMessage.includes("authentication") ||
    errorMessage.includes("unauthorized")
  )
    return AUTH_ERROR_MSG;
  if (errorMessage.includes("rate limit") || errorMessage.includes("quota"))
    return RATE_LIMIT_MSG;
  return `Email API error: ${error.message || error.error || "Unknown API error"}. Please try again later.`;
}

function classifyStandardError(error: Error): string {
  const msg = error.message.toLowerCase();
  if (
    msg.includes("token") ||
    msg.includes("authentication") ||
    msg.includes("unauthorized") ||
    msg.includes("access token missing") ||
    msg.includes("please log in again")
  )
    return AUTH_ERROR_MSG;
  if (
    msg.includes("network") ||
    msg.includes("connection") ||
    msg.includes("timeout") ||
    msg.includes("econnrefused") ||
    msg.includes("enotfound")
  ) {
    return "Connection error. Please check your internet connection and try again.";
  }
  if (
    msg.includes("rate limit") ||
    msg.includes("quota") ||
    msg.includes("too many requests")
  )
    return RATE_LIMIT_MSG;
  return `An unexpected error occurred: ${error.message}. Please try again later or contact support if the problem persists.`;
}

/**
 * Classifies errors and generates user-friendly error messages
 */
export function classifyContextAnalysisError(error: unknown): string {
  if (isApiError(error)) return classifyApiError(error as ApiError);
  if (error instanceof Error) return classifyStandardError(error);
  return "An unexpected error occurred. Please try again later or contact support if the problem persists.";
}
