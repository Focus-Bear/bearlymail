import { Logger } from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";

import { OAUTH_ERROR_CODES } from "../constants/domain-types";
import { HTTP_STATUS } from "../constants/http-status";
import { logError } from "../utils/logger";
import { ensureLogsDirSync, isDevelopment, LOGS_DIR } from "../utils/logs-dir";

ensureLogsDirSync();

const AUTH_LOG_FILE = path.join(LOGS_DIR, "auth-failures.log");
const DEBUG_LOG_FILE = path.join(LOGS_DIR, "debug.log");

// Helper to write to log file
function writeToAuthLog(message: string) {
  // Development only. In production the container filesystem is read-only, so
  // the append throws ENOENT every time and the logError() catch below dumps a
  // stack + PostHog event — high-volume CloudWatch spam. The console log in
  // logAuthFailure() is the prod-visible record.
  if (!isDevelopment) return;
  try {
    // Ensure logs directory exists (in case it was deleted between boot and now).
    // No-op in production — ensureLogsDirSync() returns early when !isDevelopment.
    ensureLogsDirSync();
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] ${message}\n`;
    fs.appendFileSync(AUTH_LOG_FILE, logLine, "utf8");
  } catch (error) {
    logError(
      "Failed to write to auth log file",
      error instanceof Error ? error : new Error(String(error)),
    );
  }
}

// Helper to write debug logs to file
export function writeDebugLog(message: string) {
  // Development only — see writeToAuthLog above (prod FS is read-only).
  if (!isDevelopment) return;
  try {
    ensureLogsDirSync();
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] ${message}\n`;
    fs.appendFileSync(DEBUG_LOG_FILE, logLine, "utf8");
  } catch (error) {
    logError(
      "Failed to write to debug log file",
      error instanceof Error ? error : new Error(String(error)),
    );
  }
}

export class AuthLogger {
  private readonly logger = new Logger("AuthLogger");

  /**
   * Log Google authentication failure with comprehensive details
   */

  logAuthFailure(
    userId: string,
    userEmail: string | null,
    context: string,
    error: unknown | null,
    additionalDetails?: Record<string, unknown>,
  ): void {
    const isSuccess = context === "LOGIN_SUCCESS" && !error;
    const errorDetails = {
      userId,
      userEmail,
      // e.g., 'syncEmails', 'scanHistory', 'tokenRefresh', 'LOGIN_SUCCESS'
      context,
      timestamp: new Date().toISOString(),
      errorType: (() => {
        if (error && typeof error === "object" && "code" in error) {
          return String((error as { code?: unknown }).code);
        }
        if (error && typeof error === "object" && "name" in error) {
          return String((error as { name?: unknown }).name);
        }
        return isSuccess ? "SUCCESS" : "Unknown";
      })(),
      errorMessage: (() => {
        if (error && typeof error === "object" && "message" in error) {
          return String((error as { message?: unknown }).message);
        }
        return isSuccess ? "Login successful" : String(error);
      })(),
      errorCode:
        error && typeof error === "object" && "code" in error
          ? (error as { code?: unknown }).code
          : undefined,
      httpStatus:
        (error && typeof error === "object" && "response" in error
          ? (error as { response?: { status?: unknown } }).response?.status
          : undefined) ||
        (error && typeof error === "object" && "status" in error
          ? (error as { status?: unknown }).status
          : undefined),

      errorData: (() => {
        if (error && typeof error === "object" && "response" in error) {
          const errRecord = error as Record<string, unknown>;
          const response = errRecord["response"] as
            | Record<string, unknown>
            | undefined;
          return response?.["data"];
        }
        if (error && typeof error === "object" && "data" in error) {
          return (error as Record<string, unknown>)["data"];
        }
        return undefined;
      })(),
      // Determine cause (if error)
      cause: error ? this.determineCause(error) : "Login successful",
      // Additional context
      ...additionalDetails,
    };

    const logMessage = isSuccess
      ? `🔐 AUTH EVENT - LOGIN:\n${JSON.stringify(errorDetails, null, 2)}`
      : `🔐 AUTH FAILURE:\n${JSON.stringify(errorDetails, null, 2)}`;

    // Log to console
    if (isSuccess) {
      this.logger.log(logMessage);
    } else {
      this.logger.error(logMessage);
    }

    // Also write to file
    writeToAuthLog(logMessage);
  }

  /** Determine the likely cause of the auth failure */
  private determineCause(error: unknown): string {
    if (!error) return "Unknown error";
    const knownCause = this.findKnownCause(error);
    if (knownCause) return knownCause;
    const errorMessage = this.hasMessage(error)
      ? error.message
      : JSON.stringify(error);
    return `Unknown error: ${errorMessage}`;
  }

  private findKnownCause(error: unknown): string | null {
    if (this.isInvalidGrant(error)) {
      return "Refresh token is invalid, expired, or revoked. User must re-authenticate.";
    }
    if (this.isUnauthorizedError(error)) {
      return "Unauthorized - access token expired or invalid. Refresh token should have been used.";
    }
    if (
      this.hasMessage(error) &&
      error.message.includes("Refresh token missing")
    ) {
      return "Refresh token not found in database. User must re-authenticate.";
    }
    if (
      this.hasMessage(error) &&
      error.message.includes("Token refresh failed")
    ) {
      return "Token refresh attempt failed. Refresh token may be invalid or expired.";
    }
    if (this.isNetworkConnectionRefused(error)) {
      return "Network error - cannot connect to Google OAuth servers.";
    }
    if (this.isTimeoutError(error)) {
      return "Timeout connecting to Google OAuth servers.";
    }
    return null;
  }

  private hasCode(err: unknown): err is { code: string | number } {
    return typeof err === "object" && err !== null && "code" in err;
  }

  private hasResponse(
    err: unknown,
  ): err is { response: { errorBody?: { error?: string }; status?: number } } {
    return (
      typeof err === "object" &&
      err !== null &&
      "response" in err &&
      typeof (err as { response: unknown }).response === "object"
    );
  }

  private hasMessage(err: unknown): err is { message: string } {
    return typeof err === "object" && err !== null && "message" in err;
  }

  private isInvalidGrant(error: unknown): boolean {
    return (
      (this.hasCode(error) && error.code === OAUTH_ERROR_CODES.INVALID_GRANT) ||
      (this.hasResponse(error) &&
        error.response?.errorBody?.error === OAUTH_ERROR_CODES.INVALID_GRANT)
    );
  }

  private isUnauthorizedError(error: unknown): boolean {
    return (
      (this.hasCode(error) && error.code === HTTP_STATUS.UNAUTHORIZED) ||
      (this.hasResponse(error) &&
        error.response?.status === HTTP_STATUS.UNAUTHORIZED)
    );
  }

  private isNetworkConnectionRefused(error: unknown): boolean {
    return (
      (this.hasCode(error) && error.code === "ECONNREFUSED") ||
      (this.hasMessage(error) && error.message.includes("ECONNREFUSED"))
    );
  }

  private isTimeoutError(error: unknown): boolean {
    return (
      (this.hasCode(error) && error.code === "ETIMEDOUT") ||
      (this.hasMessage(error) && error.message.includes("timeout"))
    );
  }
}

// Export singleton instance
export const authLogger = new AuthLogger();

// Initialize log file on module load to ensure it exists. Production no-op:
// ensureLogsDirSync() returns early and the file writes are also gated below.
try {
  ensureLogsDirSync();
  // Touch the log file to ensure it exists (create empty if it doesn't).
  // Gate on the same isDevelopment check that ensureLogsDirSync uses, so we
  // don't try to write to /app in production where USER node can't.
  if (isDevelopment && !fs.existsSync(AUTH_LOG_FILE)) {
    fs.writeFileSync(
      AUTH_LOG_FILE,
      `[${new Date().toISOString()}] Auth log file initialized\n`,
      "utf8",
    );
  }
} catch (error) {
  logError(
    "Failed to initialize auth log file",
    error instanceof Error ? error : new Error(String(error)),
  );
}
