import { PostHog } from "posthog-node";
import { Logger } from "@nestjs/common";

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
    logger.log("Global error tracking initialized");
  } else {
    logger.warn(
      "Global error tracking disabled - POSTHOG_API_KEY not set",
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
    return;
  }

  try {
    posthogClient.capture({
      distinctId: "backend-global-errors",
      event: "$exception",
      properties: {
        $exception_message: error.message,
        $exception_type: error.name,
        $exception_stack_trace_raw: error.stack,
        error_name: error.name,
        error_message: error.message,
        environment: process.env.NODE_ENV,
        service: "backend",
        ...context,
      },
    });
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
