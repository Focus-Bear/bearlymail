import { ExecutionContext, Injectable, Optional } from "@nestjs/common";
import { AuthGuard, AuthModuleOptions } from "@nestjs/passport";
import { ExtractJwt } from "passport-jwt";

/**
 * Runs JWT validation when a Bearer token is present; otherwise allows the
 * request through with no `user`. Invalid tokens are ignored (anonymous),
 * so public routes never fail closed for guests with bad/expired tokens.
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard("jwt") {
  /**
   * Nest 12 reads `@Optional()` constructor metadata with `Reflect.getOwnMetadata`
   * instead of `Reflect.getMetadata`, so the optional `AuthModuleOptions` parameter
   * declared on the `AuthGuard()` mixin is no longer inherited by subclasses.
   * Without re-declaring it here, Nest treats `AuthModuleOptions` as required and
   * every module using this guard fails to boot unless it imports `PassportModule`.
   */
  constructor(@Optional() options?: AuthModuleOptions) {
    super(options);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers?: { authorization?: string };
    }>();
    const token = ExtractJwt.fromAuthHeaderAsBearerToken()(request);
    if (!token) {
      return true;
    }
    try {
      return (await super.canActivate(context)) as boolean;
    } catch {
      return true;
    }
  }

  handleRequest<TUser = unknown>(err: unknown, user: TUser): TUser | null {
    if (err || !user) {
      return null;
    }
    return user;
  }
}
