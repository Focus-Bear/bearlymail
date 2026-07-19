import { Request } from "express";

/**
 * Common type definitions to replace `any` types throughout the codebase
 */

/**
 * Standard error type for catch blocks
 * Use instead of: catch (error: unknown)
 */
export type StandardError = Error | unknown;

/**
 * JWT payload returned by JwtStrategy.validate()
 * This is what gets attached to req.user after JWT authentication
 */
export interface JwtUserPayload {
  userId: string;
  email: string;
}

/**
 * Request with authenticated user from JWT
 * Use this instead of `@Request() req` with `(req.user as any).userId`
 */
export interface AuthenticatedRequest extends Request {
  user: JwtUserPayload;
}

/**
 * Error with optional code property (common in Node.js errors)
 */
export interface ErrorWithCode extends Error {
  code?: string | number;
}

/**
 * Type guard to check if an error has a code property
 */
export function isErrorWithCode(error: unknown): error is ErrorWithCode {
  return error instanceof Error && "code" in error;
}

/**
 * Email entity with optional htmlBody (used in summarization)
 */
export interface EmailWithHtmlBody {
  body: string;
  htmlBody?: string;
  subject?: string;
  from?: string;
  fromName?: string;
  threadId?: string;
  receivedAt?: Date | string;
}

/**
 * LLM provider type
 */
export type LLMProvider = "gemini" | "openai" | undefined;

/**
 * Google API response types
 */
export interface GoogleApiResponse<T = unknown> {
  responseBody: T;
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
}

/**
 * Google People API response types
 */
export interface GooglePeopleResponse {
  connections?: Array<{
    resourceName?: string;
    emailAddresses?: Array<{ value?: string }>;
    names?: Array<{
      displayName?: string;
      givenName?: string;
      familyName?: string;
    }>;
    phoneNumbers?: Array<{ value?: string }>;
    organizations?: Array<{
      name?: string;
      title?: string;
    }>;
    photos?: Array<{ url?: string }>;
  }>;
  nextPageToken?: string;
}

/**
 * Google Gmail API response types
 */
export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  payload?: {
    headers?: Array<{ name: string; value: string }>;
    body?: {
      data?: string;
    };
    parts?: Array<{
      mimeType?: string;
      body?: {
        data?: string;
      };
      parts?: Array<{
        mimeType?: string;
        body?: {
          data?: string;
        };
      }>;
    }>;
  };
  internalDate?: string;
}

export interface GmailThread {
  id: string;
  messages?: GmailMessage[];
  historyId?: string;
}

export interface GmailListResponse {
  messages?: Array<{ id: string; threadId: string }>;
  nextPageToken?: string;
  resultSizeEstimate?: number;
}

/**
 * GitHub API response types
 */
export interface GitHubIssueResponse {
  number: number;
  title: string;
  state: "open" | "closed";
  body?: string;
  user?: {
    login: string;
  };
  assignees?: Array<{ login: string }>;
  labels?: Array<{ name: string }>;
  pull_request?: {
    url: string;
  };
}

export interface GitHubPullRequestResponse extends GitHubIssueResponse {
  merged?: boolean;
  mergeable?: boolean;
  review_comments?: number;
  commits?: number;
  additions?: number;
  deletions?: number;
}

/**
 * Generic API error response
 */
export interface ApiError {
  code?: number | string;
  message?: string;
  error?: string;
  errors?: Array<{ message: string; domain?: string; reason?: string }>;
  status?: number;
  statusText?: string;
  response?: {
    status?: number;
    statusText?: string;
    data?: unknown;
  };
}

/**
 * Type guard to check if error is an ApiError
 */
export function isApiError(error: unknown): error is ApiError {
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
 * Database error type (PostgreSQL/TypeORM errors)
 */
export interface DatabaseError {
  code?: string;
  message?: string;
}

/**
 * Type guard to check if error is a DatabaseError
 */
export function isDatabaseError(error: unknown): error is DatabaseError {
  return (
    typeof error === "object" &&
    error !== null &&
    ("code" in error || "message" in error)
  );
}

/**
 * Safely extract error message from unknown error
 */
export function getErrorMessage(error: unknown): string {
  if (isError(error)) {
    return error.message;
  }
  if (isApiError(error)) {
    return error.message || error.error || "Unknown API error";
  }
  if (typeof error === "string") {
    return error;
  }
  return "Unknown error";
}

/**
 * Gaxios error structure (Google API client errors)
 */
export interface GaxiosErrorDetails {
  status?: number;
  statusText?: string;
  message?: string;
  errorMessage?: string;
  errorReason?: string;
  errorDomain?: string;
  responseData?: unknown;
  requestUrl?: string;
  requestMethod?: string;
}

/**
 * Type guard to check if error is a Gaxios error (Google API client error)
 */
export function isGaxiosError(error: unknown): error is {
  response?: { status?: number; statusText?: string; data?: unknown };
  config?: { url?: string; method?: string };
  message?: string;
} {
  return (
    typeof error === "object" &&
    error !== null &&
    "response" in error &&
    typeof (error as { response?: unknown }).response === "object"
  );
}

/**
 * Extract detailed error information from Gaxios/Google API errors
 * This is useful for debugging Gmail API errors which often have empty messages
 * but contain useful info in response.data
 */
export function getGaxiosErrorDetails(error: unknown): GaxiosErrorDetails {
  const details: GaxiosErrorDetails = {};

  if (!isGaxiosError(error)) {
    // Not a Gaxios error, return basic info
    if (isError(error)) {
      details.message = error.message;
    } else if (typeof error === "string") {
      details.message = error;
    }
    return details;
  }

  // Extract response info
  if (error.response) {
    details.status = error.response.status;
    details.statusText = error.response.statusText;
    details.responseData = error.response.data;

    // Try to extract error message from response data
    const responseData = error.response.data as {
      error?: {
        message?: string;
        code?: number;
        errors?: Array<{ message?: string; reason?: string; domain?: string }>;
      };
    };
    if (responseData?.error) {
      details.errorMessage = responseData.error.message;
      if (responseData.error.errors && responseData.error.errors.length > 0) {
        details.errorReason = responseData.error.errors[0].reason;
        details.errorDomain = responseData.error.errors[0].domain;
      }
    }
  }

  // Extract request info
  if (error.config) {
    details.requestUrl = error.config.url;
    details.requestMethod = error.config.method;
  }

  // Include the error message if present
  if (error.message) {
    details.message = error.message;
  }

  return details;
}

/**
 * Format Gaxios error details into a human-readable string for logging
 */
export function formatGaxiosError(error: unknown): string {
  const details = getGaxiosErrorDetails(error);

  const parts: string[] = [];

  if (details.status) {
    parts.push(`HTTP ${details.status}`);
    if (details.statusText) {
      parts.push(`(${details.statusText})`);
    }
  }

  if (details.errorMessage) {
    parts.push(`- ${details.errorMessage}`);
  } else if (details.message) {
    parts.push(`- ${details.message}`);
  }

  if (details.errorReason) {
    parts.push(`[reason: ${details.errorReason}]`);
  }

  if (details.requestUrl) {
    parts.push(`| URL: ${details.requestUrl}`);
  }

  if (parts.length === 0) {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }

  return parts.join(" ");
}
