import { Logger, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module";
import { verifyEncryptionRoundTrip } from "./encryption/encryption-boot-check";
import { ErrorTrackingService } from "./error-tracking/error-tracking.service";
import { initializeGlobalErrorTracking } from "./error-tracking/error-tracking-setup";
import { AllExceptionsFilter } from "./filters/http-exception.filter";
import { logErrorToFile, setupGlobalErrorHandlers } from "./utils/error-logger";

// Initialize PostHog for global error tracking
initializeGlobalErrorTracking();

// Set up global error handlers for unhandled rejections and exceptions
setupGlobalErrorHandlers("Server");

async function bootstrap() {
  const logger = new Logger("Bootstrap");
  // Log the deployed commit SHA so support/devs can identify the exact build from server logs.
  // COMMIT_HASH and BUILD_TIME are injected as Docker build args in the deploy workflow.
  logger.log(
    `[BearlyMail] Server version: ${process.env.COMMIT_HASH ?? "dev"} built: ${process.env.BUILD_TIME ?? "unknown"}`,
  );
  try {
    verifyEncryptionRoundTrip();
    logger.log("Encryption self-test passed.");
    // Check if running in worker mode
    if (process.env.WORKER_MODE === "true") {
      logger.log("Starting application in WORKER mode...");
      await NestFactory.createApplicationContext(AppModule);
      // Keep the process alive
      // The pg-boss workers inside onModuleInit will handle the jobs
      return;
    }

    const app = await NestFactory.create(AppModule);

    // Enable CORS for frontend (allow dev + production origins)
    const allowedOrigins = [
      process.env.FRONTEND_URL,
      "http://localhost:3000",
      "https://app.bearlymail.com",
    ].filter((origin): origin is string => Boolean(origin));
    const uniqueOrigins = [...new Set(allowedOrigins)];
    app.enableCors({
      origin:
        uniqueOrigins.length > 0 ? uniqueOrigins : "http://localhost:3000",
      credentials: true,
    });

    // Global validation pipe
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    // Global exception filter to log errors to file and PostHog
    // Get ErrorTrackingService from app context
    const errorTracking = app.get(ErrorTrackingService, { strict: false });
    app.useGlobalFilters(new AllExceptionsFilter(errorTracking));

    const DEFAULT_PORT = 3001;
    // Default port for development
    const port = process.env.PORT || DEFAULT_PORT;
    await app.listen(port);
    logger.log(`Application is running on: http://localhost:${port}`);
  } catch (error: unknown) {
    logErrorToFile("Failed to start application", error, "Server");
    process.exit(1);
  }
}

bootstrap().catch((error) => {
  logErrorToFile("Bootstrap failed", error, "Server");
  process.exit(1);
});
