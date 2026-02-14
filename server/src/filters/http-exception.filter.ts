import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
  Inject,
  Optional,
} from "@nestjs/common";
import { Request, Response } from "express";
import { logErrorToFile } from "../utils/error-logger";
import { ErrorTrackingService } from "../error-tracking/error-tracking.service";

const isProduction = process.env.NODE_ENV === "production";

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(
    @Optional()
    @Inject(ErrorTrackingService)
    private readonly errorTracking?: ErrorTrackingService,
  ) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    let message: string | object;
    if (exception instanceof HttpException) {
      message = exception.getResponse();
    } else if (exception instanceof Error) {
      const { message: errorMessage } = exception;
      message = errorMessage;
    } else {
      message = "Internal server error";
    }

    // Log error details to file (only in development)
    const errorDetails = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      message: typeof message === "string" ? message : JSON.stringify(message),
      exception:
        exception instanceof Error
          ? {
              name: exception.name,
              message: exception.message,
              stack: exception.stack,
            }
          : String(exception),
    };

    // Log 5xx errors (server errors) to file in development, and always to console (CloudWatch in production)
    if (status >= 500) {
      logErrorToFile(
        `HTTP ${status} ${request.method} ${request.url}`,
        errorDetails,
        "Server",
      );

      if (isProduction) {
        this.logger.error(
          `HTTP ${status} ${request.method} ${request.url}`,
          JSON.stringify(errorDetails),
        );
      }

      // Capture 5xx errors to PostHog (server errors, not client errors)
      if (this.errorTracking && exception instanceof Error) {
        // Extract user ID from request if available (no PII)
        const userId =
          request.user && typeof request.user === "object" && "userId" in request.user
            ? String(request.user.userId)
            : undefined;

        this.errorTracking.captureException(exception, userId, {
          http_status: status,
          http_method: request.method,
          http_path: request.url,
          user_agent: request.headers["user-agent"],
        });
      }
    }

    const clientMessage = (() => {
      if (typeof message === "string") {
        return message;
      }
      if (
        typeof message === "object" &&
        message !== null &&
        "message" in message
      ) {
        return String((message as { message?: unknown }).message);
      }
      return message;
    })();

    const sanitizedMessage =
      isProduction && status >= 500
        ? "An internal server error occurred. Please try again later."
        : clientMessage;

    response.status(status).json({
      statusCode: status,
      timestamp: errorDetails.timestamp,
      path: request.url,
      message: sanitizedMessage,
    });
  }
}
