import { Logger } from "@nestjs/common";

import { NODE_ENV_VALUES } from "../constants/domain-types";
import { captureGlobalError } from "../error-tracking/error-tracking-setup";

/**
 * Enhanced logging utility that combines console logging with PostHog error tracking.
 * Use these functions instead of console.error and console.warn throughout the codebase.
 */

/**
 * Log an error to both console and PostHog
 * @param message - The error message
 * @param error - Optional error object or additional context
 * @param context - Optional context for PostHog (e.g., userId, operation)
 */
export function logError(
  message: string,
  error?: Error | unknown,
  context?: Record<string, unknown>,
): void {
  // Always log to console
  if (error instanceof Error) {
    console.error(message, error);
  } else if (error) {
    console.error(message, error);
  } else {
    console.error(message);
  }

  // Capture to PostHog if we have an Error object
  if (error instanceof Error) {
    try {
      captureGlobalError(error, {
        log_message: message,
        ...(context || {}),
      });
    } catch (captureError) {
      // Don't let PostHog failures break error logging
      console.error("Failed to capture error to PostHog:", captureError);
    }
  } else if (error || context) {
    // If we don't have an Error object but have context, create a synthetic error
    try {
      const syntheticError = new Error(message);
      captureGlobalError(syntheticError, {
        error_data: error,
        ...(context || {}),
      });
    } catch (captureError) {
      console.error("Failed to capture error to PostHog:", captureError);
    }
  }
}

/**
 * Log a warning to both console and PostHog
 * @param message - The warning message
 * @param extraInfo - Optional extra info or context
 * @param context - Optional context for PostHog
 */
export function logWarn(
  message: string,
  extraInfo?: unknown,
  context?: Record<string, unknown>,
): void {
  // Always log to console
  if (extraInfo) {
    console.warn(message, extraInfo);
  } else {
    console.warn(message);
  }

  // Capture warnings to PostHog as custom events (not exceptions)
  // Only in production to avoid noise
  if (process.env.NODE_ENV === NODE_ENV_VALUES.PRODUCTION) {
    try {
      // Create a synthetic error for the warning to capture stack trace
      const syntheticError = new Error(message);
      captureGlobalError(syntheticError, {
        severity: "warning",
        warning_data: extraInfo,
        ...(context || {}),
      });
    } catch (captureError) {
      console.error("Failed to capture warning to PostHog:", captureError);
    }
  }
}

const moduleLogger = new Logger("logger");

/**
 * Log an informational message to console only (no PostHog).
 * Use this for success/informational messages that must NOT be treated as errors.
 * @param message - The info message
 */
export function logLog(message: string): void {
  moduleLogger.log(message);
}

/**
 * Create a logger instance with a specific context name
 * This is useful for service classes where you want to maintain context
 */
export function createLogger(contextName: string) {
  const nestLogger = new Logger(contextName);

  return {
    /**
     * Log an error with context
     */
    error: (
      message: string,
      error?: Error | unknown,
      context?: Record<string, unknown>,
    ) => {
      nestLogger.error(
        message,
        error instanceof Error ? error.stack : undefined,
      );

      if (error instanceof Error) {
        captureGlobalError(error, {
          log_message: message,
          context: contextName,
          ...(context || {}),
        });
      } else if (error || context) {
        const syntheticError = new Error(message);
        captureGlobalError(syntheticError, {
          error_data: error,
          context: contextName,
          ...(context || {}),
        });
      }
    },

    /**
     * Log a warning with context
     */
    warn: (
      message: string,
      extraInfo?: unknown,
      context?: Record<string, unknown>,
    ) => {
      nestLogger.warn(message);

      if (process.env.NODE_ENV === NODE_ENV_VALUES.PRODUCTION) {
        const syntheticError = new Error(message);
        captureGlobalError(syntheticError, {
          severity: "warning",
          warning_data: extraInfo,
          context: contextName,
          ...(context || {}),
        });
      }
    },

    /**
     * Log info (console only, no PostHog)
     */
    log: (message: string) => {
      nestLogger.log(message);
    },

    /**
     * Log debug (console only, no PostHog)
     */
    debug: (message: string) => {
      nestLogger.debug(message);
    },
  };
}
