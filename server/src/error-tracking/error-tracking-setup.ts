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
    posthogClient = new PostHog(apiKey, {
      host: apiHost,
      flushAt: 20,
      flushInterval: 10000,
    });
    logger.log(
      `✅ Global error tracking initialized (host: ${apiHost}, API key starts with: ${apiKey.substring(0, API_KEY_PREVIEW_LENGTH)}...)`,
    );
  } else {
    logger.warn("❌ Global error tracking disabled - POSTHOG_API_KEY not set");
    logger.warn(
      "Set POSTHOG_API_KEY environment variable to enable global error tracking",
    );
  }
}

/**
 * Capture an error to PostHog from global handlers
 */
export function captureGlobalError(
  error: Error,
  context: Record<string, unknown>,
): void {
  if (!posthogClient) {
    logger.debug(
      "captureGlobalError called but PostHog client not initialized",
    );
    return;
  }

  try {
    posthogClient.capture({
      distinctId: "backend-global-errors",
      event: "$exception",
      properties: {
        $exception_list: [
          {
            type: error.name,
            value: error.message,
            stacktrace: {
              type: "raw",
              frames: error.stack || "",
            },
          },
        ],
        environment: process.env.NODE_ENV,
        service: "backend",
        ...context,
      },
    });
    logger.debug(
      `Captured global error to PostHog: ${error.name} - ${error.message}`,
    );
  } catch (captureError) {
    logger.error("Failed to capture global error to PostHog", captureError);
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
