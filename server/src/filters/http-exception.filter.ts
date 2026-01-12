import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { Request, Response } from "express";
import { logErrorToFile } from "../utils/error-logger";

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
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

    // Only log 5xx errors (server errors) to file, not client errors (4xx)
    if (status >= 500) {
      logErrorToFile(
        `HTTP ${status} ${request.method} ${request.url}`,
        errorDetails,
        "Server",
      );
    }

    response.status(status).json({
      statusCode: status,
      timestamp: errorDetails.timestamp,
      path: request.url,
      message: (() => {
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
      })(),
    });
  }
}
