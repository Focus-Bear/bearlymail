import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Inject,
  Logger,
  Optional,
} from "@nestjs/common";
import { Request, Response } from "express";

import { NODE_ENV_VALUES } from "../constants/domain-types";
import { ErrorTrackingService } from "../error-tracking/error-tracking.service";
import { logErrorToFile } from "../utils/error-logger";

const isProduction = process.env.NODE_ENV === NODE_ENV_VALUES.PRODUCTION;

/** Fields the filter writes itself; an exception body can't override them. */
const RESPONSE_ENVELOPE_KEYS = new Set([
  "statusCode",
  "timestamp",
  "path",
  "message",
  "error",
]);

/**
 * Structured fields on a client-error body (`requiresPassword`, `code`,
 * `failure`, ...) are part of the API contract: the client's step-up flow,
 * AI-limit banner and plan gates branch on them. Server errors expose none.
 */
function clientErrorDetails(
  status: number,
  body: string | object,
): Record<string, unknown> {
  if (status >= HttpStatus.INTERNAL_SERVER_ERROR || typeof body !== "object") {
    return {};
  }
  return Object.fromEntries(
    Object.entries(body).filter(([key]) => !RESPONSE_ENVELOPE_KEYS.has(key)),
  );
}

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
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
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
          request.user &&
          typeof request.user === "object" &&
          "userId" in request.user
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
      // e.g. new UnauthorizedException({ requiresPassword: true }): the body's
      // fields go out as details below, and the exception's own text as message.
      return exception instanceof Error ? exception.message : message;
    })();

    const sanitizedMessage =
      isProduction && status >= HttpStatus.INTERNAL_SERVER_ERROR
        ? "An internal server error occurred. Please try again later."
        : clientMessage;

    const errorCode =
      typeof message === "object" &&
      message !== null &&
      "error" in message &&
      typeof (message as { error?: unknown }).error === "string"
        ? (message as { error: string }).error
        : undefined;

    response.status(status).json({
      ...clientErrorDetails(status, message),
      statusCode: status,
      timestamp: errorDetails.timestamp,
      path: request.url,
      message: sanitizedMessage,
      ...(errorCode ? { error: errorCode } : {}),
    });
  }
}
