import { HTTP_STATUS } from "../constants/http-status";
import { ApiError, isApiError } from "../types/common";

const AUTH_ERROR_MSG =
  "Your email account needs to be reconnected. Please go to Settings and reconnect your account.";
const RATE_LIMIT_MSG = "Too many requests. Please try again in a few minutes.";
const GATEWAY_ERROR_MSG =
  "Email API is temporarily unavailable. Please try again in a few minutes.";
const CONNECTION_ERROR_MSG =
  "Connection error. Please check your internet connection and try again.";
const GENERIC_ERROR_MSG =
  "An unexpected error occurred. Please try again later or contact support if the problem persists.";

/** Map of numeric/string HTTP status codes → user-friendly message. */
const STATUS_TO_MESSAGE: Record<string | number, string> = {
  [HTTP_STATUS.UNAUTHORIZED]: AUTH_ERROR_MSG,
  [HTTP_STATUS.FORBIDDEN]: AUTH_ERROR_MSG,
  [HTTP_STATUS.TOO_MANY_REQUESTS]: RATE_LIMIT_MSG,
  [HTTP_STATUS.BAD_GATEWAY]: GATEWAY_ERROR_MSG,
  [HTTP_STATUS.SERVICE_UNAVAILABLE]: GATEWAY_ERROR_MSG,
  [HTTP_STATUS.GATEWAY_TIMEOUT]: GATEWAY_ERROR_MSG,
};

/** Pairs of substring → message for API error message classification. */
const API_MESSAGE_PATTERNS: Array<[string, string]> = [
  ["token", AUTH_ERROR_MSG],
  ["authentication", AUTH_ERROR_MSG],
  ["unauthorized", AUTH_ERROR_MSG],
  ["rate limit", RATE_LIMIT_MSG],
  ["quota", RATE_LIMIT_MSG],
];

/** Pairs of substring → message for standard Error message classification. */
const STD_MESSAGE_PATTERNS: Array<[string, string]> = [
  ["token", AUTH_ERROR_MSG],
  ["authentication", AUTH_ERROR_MSG],
  ["unauthorized", AUTH_ERROR_MSG],
  ["access token missing", AUTH_ERROR_MSG],
  ["please log in again", AUTH_ERROR_MSG],
  ["network", CONNECTION_ERROR_MSG],
  ["connection", CONNECTION_ERROR_MSG],
  ["timeout", CONNECTION_ERROR_MSG],
  ["econnrefused", CONNECTION_ERROR_MSG],
  ["enotfound", CONNECTION_ERROR_MSG],
  ["rate limit", RATE_LIMIT_MSG],
  ["quota", RATE_LIMIT_MSG],
  ["too many requests", RATE_LIMIT_MSG],
];

function classifyApiError(error: ApiError): string {
  const status = error.response?.status || error.status || error.code;
  if (status !== undefined && STATUS_TO_MESSAGE[status]) {
    return STATUS_TO_MESSAGE[status];
  }
  const errorMessage = (
    error.message ||
    error.error ||
    "Unknown API error"
  ).toLowerCase();
  for (const [pattern, message] of API_MESSAGE_PATTERNS) {
    if (errorMessage.includes(pattern)) return message;
  }
  return `Email API error: ${error.message || error.error || "Unknown API error"}. Please try again later.`;
}

function classifyStandardError(error: Error): string {
  const msg = error.message.toLowerCase();
  for (const [pattern, message] of STD_MESSAGE_PATTERNS) {
    if (msg.includes(pattern)) return message;
  }
  return `An unexpected error occurred: ${error.message}. Please try again later or contact support if the problem persists.`;
}

/**
 * Classifies errors and generates user-friendly error messages
 */
export function classifyContextAnalysisError(error: unknown): string {
  if (isApiError(error)) return classifyApiError(error as ApiError);
  if (error instanceof Error) return classifyStandardError(error);
  return GENERIC_ERROR_MSG;
}
