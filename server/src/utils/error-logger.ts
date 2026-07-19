import * as fs from "fs";
import * as path from "path";

import { captureGlobalError } from "../error-tracking/error-tracking-setup";
import { ensureLogsDirSync, isDevelopment, LOGS_DIR } from "./logs-dir";

const ERROR_LOG_FILE = path.join(LOGS_DIR, "errors.log");

// Dev-only init. ensureLogsDirSync() is a no-op in production; the log-file
// header write is gated explicitly so we never touch /app on boot (the
// hardened USER node Dockerfile would EACCES on mkdir/write there).
if (isDevelopment) {
  ensureLogsDirSync();
  try {
    if (!fs.existsSync(ERROR_LOG_FILE)) {
      const initMessage = `[${new Date().toISOString()}] Error logging initialized\n`;
      fs.writeFileSync(ERROR_LOG_FILE, initMessage, "utf8");
    }
  } catch {
    // Best-effort: a dev environment with no write perms (e.g. sandboxed CI)
    // shouldn't crash the app; writeErrorToFile() also catches per-write.
  }
}

// Store original console.error to avoid circular calls
let originalConsoleError: typeof console.error;

/**
 * Writes error message directly to file (without console output)
 * @param message - The error message to write
 * @param error - The error object (can be any type since errors can come from various sources)
 * @param source - Optional source identifier for the error
 */
function writeErrorToFile(
  message: string,
  error?: unknown,
  source?: string,
): void {
  if (!isDevelopment) {
    return;
  }

  const timestamp = new Date().toISOString();
  let errorDetails = "";

  if (error) {
    try {
      if (error instanceof Error) {
        // Extract code property if it exists (common in Node.js errors)
        const errorCode =
          "code" in error ? (error as { code?: unknown }).code : undefined;
        errorDetails = `\n${JSON.stringify(
          {
            message: error.message,
            stack: error.stack,
            name: error.name,
            code: errorCode,
          },
          null,
          2,
        )}`;
      } else if (typeof error === "object" && error !== null) {
        errorDetails = `\n${JSON.stringify(error, null, 2)}`;
      } else {
        errorDetails = `\n${String(error)}`;
      }
    } catch {
      errorDetails = `\n${String(error)}`;
    }
  }

  const sourcePrefix = source ? `[${source}] ` : "";
  const logMessage = `[${timestamp}] ${sourcePrefix}${message}${errorDetails}\n`;

  try {
    fs.appendFileSync(ERROR_LOG_FILE, logMessage, "utf8");
  } catch (logErr) {
    // If we can't write to log file, use original console.error
    if (originalConsoleError) {
      originalConsoleError("Failed to write to error log file:", logErr);
    }
  }
}

/**
 * Logs errors to file during local development.
 * Also logs to console for visibility.
 * @param message - The error message to log
 * @param error - The error object (can be any type since errors can come from various sources)
 * @param source - Optional source identifier for the error
 */
export function logErrorToFile(
  message: string,
  error?: unknown,
  source?: string,
): void {
  const timestamp = new Date().toISOString();
  let errorDetails = "";

  if (error) {
    try {
      if (error instanceof Error) {
        // Extract code property if it exists (common in Node.js errors)
        const errorCode =
          "code" in error ? (error as { code?: unknown }).code : undefined;
        errorDetails = `\n${JSON.stringify(
          {
            message: error.message,
            stack: error.stack,
            name: error.name,
            code: errorCode,
          },
          null,
          2,
        )}`;
      } else if (typeof error === "object" && error !== null) {
        errorDetails = `\n${JSON.stringify(error, null, 2)}`;
      } else {
        errorDetails = `\n${String(error)}`;
      }
    } catch {
      errorDetails = `\n${String(error)}`;
    }
  }

  const sourcePrefix = source ? `[${source}] ` : "";
  const logMessage = `[${timestamp}] ${sourcePrefix}${message}${errorDetails}\n`;

  // Use original console.error if available, otherwise regular console.error
  if (originalConsoleError) {
    originalConsoleError(logMessage.trim());
  } else {
    console.error(logMessage.trim());
  }

  // Write to file (separate function to avoid circular calls)
  writeErrorToFile(message, error, source);
}

/**
 * Sets up global error handlers for unhandled rejections and uncaught exceptions.
 * Also intercepts console.error to log errors to file.
 * Should be called early in the application lifecycle.
 */
export function setupGlobalErrorHandlers(source?: string): void {
  // Store original console.error if not already stored
  if (!originalConsoleError) {
    originalConsoleError = console.error.bind(console);
  }

  // Intercept console.error to also log to file
  // Using unknown[] since console.error can receive any type of argument
  console.error = (...args: unknown[]) => {
    // Call original console.error first
    originalConsoleError.apply(console, args);

    // Also log to file during development
    if (isDevelopment) {
      try {
        // Try to format the error message
        const messages = args.map((arg) => {
          if (arg instanceof Error) {
            return arg.message;
          } else if (typeof arg === "object" && arg !== null) {
            try {
              return JSON.stringify(arg);
            } catch {
              return String(arg);
            }
          }
          return String(arg);
        });

        const errorMessage = messages.join(" ");

        // Try to extract Error object if present
        const errorObj = args.find((arg) => arg instanceof Error);

        // Write directly to file to avoid circular calls
        writeErrorToFile(errorMessage, errorObj || undefined, source);
      } catch (logErr) {
        // If logging fails, don't break console.error
        originalConsoleError("Failed to log error to file:", logErr);
      }
    }
  };

  // Handle unhandled promise rejections
  // Using unknown for reason since it can be any type (errors, strings, objects, etc.)
  process.on(
    "unhandledRejection",
    (reason: unknown, promise: Promise<unknown>) => {
      logErrorToFile(
        "Unhandled Rejection",
        { promise: String(promise), reason },
        source,
      );

      // Capture to PostHog (production only, avoid noise in dev)
      if (!isDevelopment && reason instanceof Error) {
        captureGlobalError(reason, {
          error_type: "unhandled_rejection",
          source: source || "unknown",
        });
      }

      // Log but don't crash - let the app handle reconnections
      // Check if reason is an Error with a message property
      let reasonMessage: string | null = null;
      if (reason instanceof Error) {
        reasonMessage = reason.message;
      } else if (
        typeof reason === "object" &&
        reason !== null &&
        "message" in reason
      ) {
        reasonMessage = String((reason as { message: unknown }).message);
      }
      if (reasonMessage && reasonMessage.includes("Connection terminated")) {
        console.warn(
          "Database connection error detected, will retry automatically",
        );
        return;
      }
    },
  );

  // Handle uncaught exceptions
  process.on("uncaughtException", (error: Error) => {
    logErrorToFile("Uncaught Exception", error, source);

    // Capture to PostHog (production only)
    if (!isDevelopment) {
      captureGlobalError(error, {
        error_type: "uncaught_exception",
        source: source || "unknown",
      });
    }

    // Only exit on critical errors, not connection errors
    if (error.message && error.message.includes("Connection terminated")) {
      console.warn("Database connection error, will retry automatically");
      return;
    }
    // For other critical errors, exit gracefully
    process.exit(1);
  });
}
