import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { AppModule } from "./app.module";
import { AllExceptionsFilter } from "./filters/http-exception.filter";
import { setupGlobalErrorHandlers, logErrorToFile } from "./utils/error-logger";

// Set up global error handlers for unhandled rejections and exceptions
setupGlobalErrorHandlers("Server");

async function bootstrap() {
  try {
    // Check if running in worker mode
    if (process.env.WORKER_MODE === "true") {
      // eslint-disable-next-line no-console
      console.log("Starting application in WORKER mode...");
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
    ].filter((o): o is string => Boolean(o));
    const uniqueOrigins = [...new Set(allowedOrigins)];
    app.enableCors({
      origin:
        uniqueOrigins.length > 0
          ? uniqueOrigins
          : "http://localhost:3000",
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

    // Global exception filter to log errors to file
    app.useGlobalFilters(new AllExceptionsFilter());

    const DEFAULT_PORT = 3001;
    // Default port for development
    const port = process.env.PORT || DEFAULT_PORT;
    await app.listen(port);
    // eslint-disable-next-line no-console
    console.log(`Application is running on: http://localhost:${port}`);
  } catch (error: unknown) {
    logErrorToFile("Failed to start application", error, "Server");
    process.exit(1);
  }
}

bootstrap().catch((error) => {
  logErrorToFile("Bootstrap failed", error, "Server");
  process.exit(1);
});
