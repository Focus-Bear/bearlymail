import { PostHog } from "posthog-node";
import { Logger } from "@nestjs/common";

const API_KEY_PREVIEW_LENGTH = 8;

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
      logger.log(
        `✅ Global error tracking initialized (host: ${apiHost}, API key starts with: ${apiKey.substring(0, API_KEY_PREVIEW_LENGTH)}...)`,
      );
      console.error(
        `POSTHOG: Global tracking initialized (host: ${apiHost}, key prefix: ${apiKey.substring(0, API_KEY_PREVIEW_LENGTH)}...)`,
      );
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
    console.error(
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
    console.error(
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
    logger.debug(
      `Captured global error to PostHog: ${error.name} - ${error.message}`,
    );
  } catch (captureError) {
    logger.error("Failed to capture global error to PostHog", captureError);
    console.error(
      `POSTHOG: Failed to capture global error "${error.name}: ${error.message}":`,
      captureError instanceof Error
        ? captureError.message
        : String(captureError),
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
