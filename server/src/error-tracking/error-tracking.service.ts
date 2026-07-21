import { Injectable, Logger } from "@nestjs/common";
import { PostHog } from "posthog-node";

import { sanitizeLogInput } from "../utils/sanitize-log";

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
          flushAt: 20,
          flushInterval: 10000,
        });

        this.logger.log(
          `✅ PostHog error tracking initialized (host: ${apiHost}, flushAt: 20 events, flushInterval: 10s)`,
        );
        // Do not log any portion of the API key — even a prefix is sensitive (CWE-312/532).
        console.error(`POSTHOG: Initialized successfully (host: ${apiHost})`);
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
   * Capture an exception/error to PostHog.
   * These are handled (caught) errors explicitly captured by application code.
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
        `POSTHOG: captureException called but PostHog is not initialized (isEnabled: ${this.isEnabled}, hasClient: ${!!this.posthog}). Error not tracked: ${sanitizeLogInput(error.name)}: ${sanitizeLogInput(error.message)}`,
      );
      return;
    }

    try {
      const distinctId = userId || "backend-errors";
      const properties: Record<string, unknown> = {
        environment: process.env.NODE_ENV,
        service: "backend",
        ...this.sanitizeProperties(additionalContext || {}),
      };

      // Use SDK native captureException - it builds the correct schema including
      // the platform field that PostHog serde ingestion requires.
      // posthog.capture({ event: "" }) is unreliable per SDK warning.
      this.posthog.captureException(error, distinctId, properties);

      this.logger.debug(
        `Captured exception to PostHog: ${error.name} - ${error.message} (distinctId: ${distinctId})`,
      );
    } catch (captureError) {
      this.logger.error("Failed to capture exception to PostHog", captureError);
      // Keep the user-influenced error text out of the format-string position so a
      // '%s' in error.message can't be interpreted as a substitution (CWE-134).
      console.error(
        "POSTHOG: Failed to capture exception %s:",
        `${sanitizeLogInput(error.name)}: ${sanitizeLogInput(error.message)}`,
        captureError instanceof Error
          ? sanitizeLogInput(captureError.message)
          : sanitizeLogInput(captureError),
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

    delete sanitized.email;
    delete sanitized.name;
    delete sanitized.firstName;
    delete sanitized.lastName;
    delete sanitized.phone;
    delete sanitized.address;
    delete sanitized.query;
    delete sanitized.subject;
    delete sanitized.body;
    delete sanitized.message;

    return sanitized;
  }
}
