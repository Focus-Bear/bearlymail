import { Injectable, ExecutionContext } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

@Injectable()
export class MicrosoftAuthGuard extends AuthGuard("microsoft") {
  handleRequest<TUser = unknown>(
    err: Error | null,
    user: TUser | false,
    info: unknown,
    context: ExecutionContext,
  ): TUser {
    if (err || !user) {
      const request = context.switchToHttp().getRequest();
      request.authError = err || new Error("Authentication failed");
      return { authFailed: true } as TUser;
    }
    return user;
  }
}
