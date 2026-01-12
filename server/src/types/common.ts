/**
 * Common type definitions to replace `any` types throughout the codebase
 */

/**
 * Standard error type for catch blocks
 * Use instead of: catch (error: unknown)
 */
export type StandardError = Error | unknown;

/**
 * Google API response types
 */
export interface GoogleApiResponse<T = unknown> {
  // eslint-disable-next-line id-denylist
  data: T;
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
      // eslint-disable-next-line id-denylist
      data?: string;
    };
    parts?: Array<{
      mimeType?: string;
      body?: {
        // eslint-disable-next-line id-denylist
        data?: string;
      };
      parts?: Array<{
        mimeType?: string;
        body?: {
          // eslint-disable-next-line id-denylist
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
    statusText?: string;
    // eslint-disable-next-line id-denylist
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
