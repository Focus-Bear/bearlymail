import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";

/** The single account allowed to seed/delete test data. */
export const TESTER_EMAIL = "testerbearlymail@gmail.com";

/**
 * Allows a request only when the authenticated user's email is {@link TESTER_EMAIL}.
 * `req.user.email` is the decrypted plaintext set by the JWT strategy. Must be used
 * AFTER `JwtAuthGuard` so `req.user` is populated.
 */
@Injectable()
export class TesterOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<{ user?: { email?: string } }>();
    if (request.user?.email !== TESTER_EMAIL) {
      throw new ForbiddenException(
        "Seed test data is restricted to the test account",
      );
    }
    return true;
  }
}
