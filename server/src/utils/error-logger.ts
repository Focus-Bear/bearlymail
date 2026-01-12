import * as fs from "fs";
import * as path from "path";

// Only log to file during local development
const isDevelopment = process.env.NODE_ENV !== "production";

// Ensure logs directory exists
const LOGS_DIR = path.join(process.cwd(), "logs");
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

const ERROR_LOG_FILE = path.join(LOGS_DIR, "errors.log");

// Initialize log file with a header on first load (only in development)
if (isDevelopment && !fs.existsSync(ERROR_LOG_FILE)) {
  const initMessage = `[${new Date().toISOString()}] Error logging initialized\n`;
  try {
    fs.writeFileSync(ERROR_LOG_FILE, initMessage, "utf8");
  } catch {
    // Ignore initialization errors
  }
}

// Store original console.error to avoid circular calls
let originalConsoleError: typeof console.error;

/**
 * Writes error message directly to file (without console output)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function writeErrorToFile(message: string, error?: any, source?: string): void {
  if (!isDevelopment) {
    return;
  }

  const timestamp = new Date().toISOString();
  let errorDetails = "";

  if (error) {
    try {
      if (error instanceof Error) {
        errorDetails = `\n${JSON.stringify(
          {
            message: error.message,
            stack: error.stack,
            name: error.name,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            code: (error as any).code,
          },
          null,
          2,
        )}`;
      } else if (typeof error === "object") {
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
 */
export function logErrorToFile(
  message: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  error?: any,
  source?: string,
): void {
  const timestamp = new Date().toISOString();
  let errorDetails = "";

  if (error) {
    try {
      if (error instanceof Error) {
        errorDetails = `\n${JSON.stringify(
          {
            message: error.message,
            stack: error.stack,
            name: error.name,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            code: (error as any).code,
          },
          null,
          2,
        )}`;
      } else if (typeof error === "object") {
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  console.error = (...args: any[]) => {
    // Call original console.error first
    originalConsoleError.apply(console, args);

    // Also log to file during development
    if (isDevelopment) {
      try {
        // Try to format the error message
        const messages = args.map((arg) => {
          if (arg instanceof Error) {
            return arg.message;
          } else if (typeof arg === "object") {
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.on("unhandledRejection", (reason: any, promise: Promise<any>) => {
    logErrorToFile(
      "Unhandled Rejection",
      { promise: String(promise), reason },
      source,
    );
    // Log but don't crash - let the app handle reconnections
    if (
      reason &&
      reason.message &&
      reason.message.includes("Connection terminated")
    ) {
      console.warn(
        "Database connection error detected, will retry automatically",
      );
      return;
    }
  });

  // Handle uncaught exceptions
  process.on("uncaughtException", (error: Error) => {
    logErrorToFile("Uncaught Exception", error, source);
    // Only exit on critical errors, not connection errors
    if (error.message && error.message.includes("Connection terminated")) {
      console.warn("Database connection error, will retry automatically");
      return;
    }
    // For other critical errors, exit gracefully
    process.exit(1);
  });
}
