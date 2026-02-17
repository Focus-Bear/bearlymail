import { Logger } from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";
import { logError } from "../utils/logger";

// Ensure logs directory exists
const LOGS_DIR = path.join(process.cwd(), "logs");
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

const AUTH_LOG_FILE = path.join(LOGS_DIR, "auth-failures.log");
const DEBUG_LOG_FILE = path.join(LOGS_DIR, "debug.log");

// Helper to write to log file
function writeToAuthLog(message: string) {
  try {
    // Ensure logs directory exists (in case it was deleted)
    if (!fs.existsSync(LOGS_DIR)) {
      fs.mkdirSync(LOGS_DIR, { recursive: true });
    }
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
  try {
    // Ensure logs directory exists (in case it was deleted)
    if (!fs.existsSync(LOGS_DIR)) {
      fs.mkdirSync(LOGS_DIR, { recursive: true });
    }
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
  // eslint-disable-next-line complexity
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
      // eslint-disable-next-line id-denylist
      errorData: (() => {
        if (error && typeof error === "object" && "response" in error) {
          // eslint-disable-next-line id-denylist
          return (error as { response?: { data?: unknown } }).response?.data;
        }
        if (error && typeof error === "object" && "data" in error) {
          // eslint-disable-next-line id-denylist
          return (error as { data?: unknown }).data;
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

  /**
   * Determine the likely cause of the auth failure
   */
  private determineCause(error: unknown): string {
    if (!error) return "Unknown error";

    // Type guard helper
    const hasCode = (e: unknown): e is { code: string | number } =>
      typeof e === "object" && e !== null && "code" in e;

    const hasResponse = (
      e: unknown,
    ): e is { response: { data?: { error?: string }; status?: number } } =>
      typeof e === "object" &&
      e !== null &&
      "response" in e &&
      typeof (e as { response: unknown }).response === "object";

    const hasMessage = (e: unknown): e is { message: string } =>
      typeof e === "object" && e !== null && "message" in e;

    // Check for specific error codes
    if (
      (hasCode(error) && error.code === "invalid_grant") ||
      (hasResponse(error) && error.response?.data?.error === "invalid_grant")
    ) {
      return "Refresh token is invalid, expired, or revoked. User must re-authenticate.";
    }

    if (
      (hasCode(error) && error.code === 401) ||
      (hasResponse(error) && error.response?.status === 401)
    ) {
      return "Unauthorized - access token expired or invalid. Refresh token should have been used.";
    }

    if (hasMessage(error) && error.message.includes("Refresh token missing")) {
      return "Refresh token not found in database. User must re-authenticate.";
    }

    if (hasMessage(error) && error.message.includes("Token refresh failed")) {
      return "Token refresh attempt failed. Refresh token may be invalid or expired.";
    }

    if (
      (hasCode(error) && error.code === "ECONNREFUSED") ||
      (hasMessage(error) && error.message.includes("ECONNREFUSED"))
    ) {
      return "Network error - cannot connect to Google OAuth servers.";
    }

    if (
      (hasCode(error) && error.code === "ETIMEDOUT") ||
      (hasMessage(error) && error.message.includes("timeout"))
    ) {
      return "Timeout connecting to Google OAuth servers.";
    }

    const errorMessage = hasMessage(error)
      ? error.message
      : JSON.stringify(error);
    return `Unknown error: ${errorMessage}`;
  }
}

// Export singleton instance
export const authLogger = new AuthLogger();

// Initialize log file on module load to ensure it exists
try {
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }
  // Touch the log file to ensure it exists (create empty if it doesn't)
  if (!fs.existsSync(AUTH_LOG_FILE)) {
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
