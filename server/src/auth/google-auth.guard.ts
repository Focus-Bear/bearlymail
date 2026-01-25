import { Injectable, ExecutionContext, Logger } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

@Injectable()
export class GoogleAuthGuard extends AuthGuard("google") {
  private readonly logger = new Logger(GoogleAuthGuard.name);

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const url = request.url;
    const method = request.method;
    this.logger.log(
      `[canActivate] Called for ${method} ${url} - has code: ${!!request.query?.code}`,
    );
    return super.canActivate(context);
  }

  handleRequest<TUser = unknown>(
    err: Error | null,
    user: TUser | false,
    info: unknown,
    context: ExecutionContext,
  ): TUser {
    const request = context.switchToHttp().getRequest();
    const url = request.url?.split("?")[0]; // Remove query params for cleaner logging

    // Always log what we received for debugging
    this.logger.log(
      `[handleRequest] ${url} - err: ${err?.message || "null"}, user: ${user ? "present" : "false"}, info type: ${typeof info}`,
    );

    // If there's an error or no user, attach the error to the request
    // so the controller can handle it and redirect appropriately
    if (err || !user) {
      // Log detailed error info
      this.logger.warn(
        `[handleRequest] Auth failed for ${url} - err: ${err?.message || "null"}, user: ${user ? "present" : "false"}, info: ${JSON.stringify(info)}`,
      );

      // The error might come through as `err` or through `info` depending on how Passport handles it
      // Check both sources for the error message
      let errorMessage = "Authentication failed";
      if (err?.message) {
        errorMessage = err.message;
      } else if (info && typeof info === "object" && "message" in info) {
        errorMessage = (info as { message: string }).message;
      } else if (info && typeof info === "string") {
        errorMessage = info;
      }

      request.authError = new Error(errorMessage);
      // Return a placeholder to allow the request to continue to the controller
      return { authFailed: true } as TUser;
    }
    return user;
  }
}
