import { Injectable, ExecutionContext } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

@Injectable()
export class ZohoAuthGuard extends AuthGuard("zoho") {
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
