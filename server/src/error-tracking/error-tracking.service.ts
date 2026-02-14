import { Injectable, Logger } from "@nestjs/common";
import { PostHog } from "posthog-node";

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
      this.posthog = new PostHog(apiKey!, {
        host: apiHost,
        // Automatically batch events for performance
        flushAt: 20, // Flush every 20 events
        flushInterval: 10000, // Or every 10 seconds
      });

      this.logger.log("PostHog error tracking initialized");
    } else {
      this.logger.warn(
        "PostHog error tracking disabled - POSTHOG_API_KEY not set",
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
      return;
    }

    try {
      // Build properties (ensure no PII)
      const properties: Record<string, unknown> = {
        $exception_message: error.message,
        $exception_type: error.name,
        $exception_stack_trace_raw: error.stack,
        error_name: error.name,
        error_message: error.message,
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
    } catch (captureError) {
      // Don't throw errors when trying to capture errors
      this.logger.error("Failed to capture exception to PostHog", captureError);
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
