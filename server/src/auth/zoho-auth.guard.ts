import { ExecutionContext, Injectable, Logger } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

@Injectable()
export class ZohoAuthGuard extends AuthGuard("zoho") {
  private readonly logger = new Logger(ZohoAuthGuard.name);

  handleRequest<TUser = unknown>(
    err: Error | null,
    user: TUser | false,
    info: unknown,
    context: ExecutionContext,
  ): TUser {
    const request = context.switchToHttp().getRequest();

    // If authentication succeeded, return the user
    if (user && !err) {
      return user;
    }

    // If there's an error or no user, attach the error to the request
    this.logger.warn(
      `Zoho auth failed - err: ${err?.message || "null"}, user: ${user ? "present" : "false"}, info: ${JSON.stringify(info)}`,
    );

    // The error might come through as `err` or through `info` depending on how Passport handles it
    let errorMessage = "Authentication failed";
    if (err?.message) {
      errorMessage = err.message;
    } else if (info && typeof info === "object" && "message" in info) {
      errorMessage = (info as { message: string }).message;
    } else if (info && typeof info === "string") {
      errorMessage = info;
    }

    request.authError = new Error(errorMessage);
    return { authFailed: true } as TUser;
  }
}
