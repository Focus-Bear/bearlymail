import { Injectable, Logger } from "@nestjs/common";
import { PostHog } from "posthog-node";

const API_KEY_PREVIEW_LENGTH = 8;

interface ExceptionFrame {
  filename: string;
  function: string;
  lineno: number;
  colno: number;
  in_app: boolean;
}

/**
 * Parse a Node.js Error.stack string into an array of frame objects.
 * PostHog Error Tracking requires stacktrace.frames to be an array,
 * not a raw string, in order to display and group errors correctly.
 */
function parseStackTrace(stack: string): ExceptionFrame[] {
  if (!stack) return [];

  const frames: ExceptionFrame[] = [];

  for (const line of stack.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("at ")) continue;

    // "at FunctionName (filename:line:col)" or "at async FunctionName (...)"
    const withName = trimmed.match(
      /^at\s+(?:async\s+)?(.+?)\s+\((.+?):(\d+):(\d+)\)$/,
    );
    if (withName) {
      const filename = withName[2];
      frames.push({
        function: withName[1],
        filename,
        lineno: parseInt(withName[3], 10),
        colno: parseInt(withName[4], 10),
        in_app:
          !filename.includes("node_modules") &&
          !filename.startsWith("node:") &&
          !filename.startsWith("internal/"),
      });
      continue;
    }

    // "at filename:line:col" (anonymous)
    const anonymous = trimmed.match(/^at\s+(?:async\s+)?(.+?):(\d+):(\d+)$/);
    if (anonymous) {
      const filename = anonymous[1];
      frames.push({
        function: "<anonymous>",
        filename,
        lineno: parseInt(anonymous[2], 10),
        colno: parseInt(anonymous[3], 10),
        in_app:
          !filename.includes("node_modules") &&
          !filename.startsWith("node:") &&
          !filename.startsWith("internal/"),
      });
    }
  }

  return frames;
}

/**
 * Service for tracking errors and events to PostHog
 * See: https://posthog.com/docs/libraries/node
 */
@Injectable()
export class ErrorTrackingService {
  private readonly logger = new Logger(ErrorTrackingService.name);
  private posthog: PostHog | null = null;
  private readonly isEnabled: boolean;

  constructor() {
    const apiKey = process.env.POSTHOG_API_KEY;
    const apiHost = process.env.POSTHOG_HOST || "https://us.i.posthog.com";

    this.isEnabled = Boolean(apiKey);

    if (this.isEnabled) {
      try {
        this.posthog = new PostHog(apiKey!, {
          host: apiHost,
          // Automatically batch events for performance
          flushAt: 20, // Flush every 20 events
          flushInterval: 10000, // Or every 10 seconds
        });

        this.logger.log(
          `✅ PostHog error tracking initialized (host: ${apiHost}, flushAt: 20 events, flushInterval: 10s)`,
        );
        this.logger.debug(
          `PostHog API key (first 8 chars): ${apiKey!.substring(0, API_KEY_PREVIEW_LENGTH)}...`,
        );
        console.error(
          `POSTHOG: Initialized successfully (host: ${apiHost}, key prefix: ${apiKey!.substring(0, API_KEY_PREVIEW_LENGTH)}...)`,
        );
      } catch (initError) {
        this.logger.error("Failed to initialize PostHog client", initError);
        console.error(
          `POSTHOG: Failed to initialize client:`,
          initError instanceof Error ? initError.message : String(initError),
        );
      }
    } else {
      this.logger.warn(
        "❌ PostHog error tracking disabled - POSTHOG_API_KEY not set",
      );
      this.logger.warn(
        "Set POSTHOG_API_KEY environment variable to enable error tracking",
      );
      console.error(
        "POSTHOG: Disabled - POSTHOG_API_KEY environment variable is not set",
      );
    }
  }

  /**
   * Capture an exception/error to PostHog
   * @param error - The error object
   * @param userId - Optional user ID (NO PII - use UUID)
   * @param additionalContext - Additional context (NO PII)
   */
  captureException(
    error: Error,
    userId?: string,
    additionalContext?: Record<string, unknown>,
  ): void {
    if (!this.isEnabled || !this.posthog) {
      this.logger.debug(
        `PostHog captureException called but tracking is disabled (isEnabled: ${this.isEnabled}, hasClient: ${!!this.posthog})`,
      );
      console.error(
        `POSTHOG: captureException called but PostHog is not initialized (isEnabled: ${this.isEnabled}, hasClient: ${!!this.posthog}). Error not tracked: ${error.name}: ${error.message}`,
      );
      return;
    }

    try {
      // Build properties using PostHog's $exception_list format, which is
      // required by the Error Tracking dashboard for grouping and display.
      // frames must be an array of {filename, function, lineno, colno} objects.
      const properties: Record<string, unknown> = {
        $exception_list: [
          {
            type: error.name,
            value: error.message,
            stacktrace: {
              frames: parseStackTrace(error.stack || ""),
            },
          },
        ],
        environment: process.env.NODE_ENV,
        service: "backend",
        ...this.sanitizeProperties(additionalContext || {}),
      };

      // Use userId as distinct_id if provided, otherwise use a generic backend identifier
      const distinctId = userId || "backend-errors";

      this.posthog.capture({
        distinctId,
        event: "$exception",
        properties,
      });

      this.logger.debug(
        `Captured exception to PostHog: ${error.name} - ${error.message} (distinctId: ${distinctId})`,
      );
    } catch (captureError) {
      // Don't throw errors when trying to capture errors
      this.logger.error("Failed to capture exception to PostHog", captureError);
      console.error(
        `POSTHOG: Failed to capture exception "${error.name}: ${error.message}":`,
        captureError instanceof Error
          ? captureError.message
          : String(captureError),
      );
    }
  }

  /**
   * Capture a custom event to PostHog
   * @param eventName - Event name
   * @param userId - Optional user ID (NO PII - use UUID)
   * @param properties - Event properties (NO PII)
   */
  captureEvent(
    eventName: string,
    userId?: string,
    properties?: Record<string, unknown>,
  ): void {
    if (!this.isEnabled || !this.posthog) {
      return;
    }

    try {
      const distinctId = userId || "backend-events";
      const sanitizedProperties = this.sanitizeProperties(properties || {});

      this.posthog.capture({
        distinctId,
        event: eventName,
        properties: {
          ...sanitizedProperties,
          environment: process.env.NODE_ENV,
          service: "backend",
        },
      });
    } catch (captureError) {
      this.logger.error("Failed to capture event to PostHog", captureError);
    }
  }

  /**
   * Identify a user (set user properties)
   * @param userId - User ID (NO PII - use UUID)
   * @param properties - User properties (NO PII)
   */
  identifyUser(userId: string, properties?: Record<string, unknown>): void {
    if (!this.isEnabled || !this.posthog) {
      return;
    }

    try {
      const sanitizedProperties = this.sanitizeProperties(properties || {});

      this.posthog.identify({
        distinctId: userId,
        properties: sanitizedProperties,
      });
    } catch (identifyError) {
      this.logger.error("Failed to identify user in PostHog", identifyError);
    }
  }

  /**
   * Flush all pending events (call on shutdown)
   */
  async shutdown(): Promise<void> {
    if (!this.isEnabled || !this.posthog) {
      return;
    }

    try {
      await this.posthog.shutdown();
      this.logger.log("PostHog client shut down successfully");
    } catch (shutdownError) {
      this.logger.error("Failed to shut down PostHog client", shutdownError);
    }
  }

  /**
   * Remove PII from properties
   * @param properties - Properties to sanitize
   * @returns Sanitized properties
   */
  private sanitizeProperties(
    properties: Record<string, unknown>,
  ): Record<string, unknown> {
    const sanitized = { ...properties };

    // Remove common PII fields
    delete sanitized.email;
    delete sanitized.name;
    delete sanitized.firstName;
    delete sanitized.lastName;
    delete sanitized.phone;
    delete sanitized.address;
    delete sanitized.query; // Search queries are PII
    delete sanitized.subject; // Email subjects are PII
    delete sanitized.body; // Email bodies are PII
    delete sanitized.message; // May contain PII

    return sanitized;
  }
}
