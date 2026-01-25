import { Injectable, ExecutionContext, Logger } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

@Injectable()
export class MicrosoftAuthGuard extends AuthGuard("microsoft") {
  private readonly logger = new Logger(MicrosoftAuthGuard.name);

  handleRequest<TUser = unknown>(
    err: Error | null,
    user: TUser | false,
    info: unknown,
    context: ExecutionContext,
  ): TUser {
    if (err || !user) {
      const request = context.switchToHttp().getRequest();

      // Log what we received for debugging
      this.logger.warn(
        `Microsoft auth failed - err: ${err?.message || "null"}, user: ${user ? "present" : "false"}, info: ${JSON.stringify(info)}`,
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
    return user;
  }
}


