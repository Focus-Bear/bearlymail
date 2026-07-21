import { Logger } from "@nestjs/common";
import { PostHog } from "posthog-node";

import { sanitizeLogInput } from "../utils/sanitize-log";

let posthogClient: PostHog | null = null;
const logger = new Logger("ErrorTrackingSetup");

/**
 * Initialize PostHog client for global error handlers
 * This is separate from the service to be available before NestJS bootstraps
 */
export function initializeGlobalErrorTracking(): void {
  const apiKey = process.env.POSTHOG_API_KEY;
  const apiHost = process.env.POSTHOG_HOST || "https://us.i.posthog.com";

  if (apiKey) {
    try {
      posthogClient = new PostHog(apiKey, {
        host: apiHost,
        flushAt: 20,
        flushInterval: 10000,
      });
      // Never log any portion of the API key — even a prefix is sensitive (CWE-312/532).
      logger.log(`✅ Global error tracking initialized (host: ${apiHost})`);
    } catch (initError) {
      logger.error("Failed to initialize global PostHog client", initError);
      console.error(
        `POSTHOG: Failed to initialize global client:`,
        initError instanceof Error ? initError.message : String(initError),
      );
    }
  } else {
    logger.warn("❌ Global error tracking disabled - POSTHOG_API_KEY not set");
    logger.warn(
      "Set POSTHOG_API_KEY environment variable to enable global error tracking",
    );
    logger.log(
      "POSTHOG: Disabled - POSTHOG_API_KEY environment variable is not set",
    );
  }
}

/**
 * Capture an error to PostHog from global handlers.
 * These are unhandled errors (uncaughtException, unhandledRejection),
 * so handled is set to false.
 */
export function captureGlobalError(
  error: Error,
  context: Record<string, unknown>,
): void {
  if (!posthogClient) {
    logger.debug(
      "captureGlobalError called but PostHog client not initialized",
    );
    logger.log(
      `POSTHOG: captureGlobalError called but client not initialized - error was: ${error.name}: ${error.message}`,
    );
    return;
  }

  try {
    const properties: Record<string, unknown> = {
      environment: process.env.NODE_ENV,
      service: "backend",
      ...context,
    };

    // Use SDK native captureException - it builds the correct schema including
    // the platform field that PostHog serde ingestion requires.
    // posthog.capture({ event: "" }) is unreliable per SDK warning.
    posthogClient.captureException(error, "backend-global-errors", properties);
    // Intentionally no success log here: this fires once per captured error and
    // was a high-volume source of CloudWatch noise. Failures are still logged below.
  } catch (captureError) {
    logger.error("Failed to capture global error to PostHog", captureError);
    // Keep the user-influenced error text out of the format-string position so a
    // '%s' in error.message can't be interpreted as a substitution (CWE-134).
    console.error(
      "POSTHOG: Failed to capture global error %s:",
      `${sanitizeLogInput(error.name)}: ${sanitizeLogInput(error.message)}`,
      captureError instanceof Error
        ? sanitizeLogInput(captureError.message)
        : sanitizeLogInput(captureError),
    );
  }
}

/**
 * Capture a custom event to PostHog from pre-NestJS or non-injectable contexts.
 * Safe to call before NestJS bootstraps (uses the module-level posthogClient).
 */
export function captureGlobalEvent(
  eventName: string,
  properties?: Record<string, unknown>,
): void {
  if (!posthogClient) {
    return;
  }

  try {
    posthogClient.capture({
      distinctId: "backend-events",
      event: eventName,
      properties: {
        ...properties,
        environment: process.env.NODE_ENV,
        service: "backend",
      },
    });
  } catch (captureError) {
    logger.error(
      `Failed to capture event "${eventName}" to PostHog`,
      captureError,
    );
  }
}

/**
 * Shutdown the global PostHog client
 */
export async function shutdownGlobalErrorTracking(): Promise<void> {
  if (!posthogClient) {
    return;
  }

  try {
    await posthogClient.shutdown();
    logger.log("Global error tracking shut down");
  } catch (shutdownError) {
    logger.error("Failed to shut down global error tracking", shutdownError);
  }
}
