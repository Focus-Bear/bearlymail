import { Injectable, ExecutionContext } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

@Injectable()
export class GoogleAuthGuard extends AuthGuard("google") {
  handleRequest<TUser = unknown>(
    err: Error | null,
    user: TUser | false,
    info: unknown,
    context: ExecutionContext,
  ): TUser {
    // If there's an error or no user, attach the error to the request
    // so the controller can handle it and redirect appropriately
    if (err || !user) {
      const request = context.switchToHttp().getRequest();
      request.authError = err || new Error("Authentication failed");
      // Return a placeholder to allow the request to continue to the controller
      return { authFailed: true } as TUser;
    }
    return user;
  }
}
