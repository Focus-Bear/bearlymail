import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";

/**
 * Header name used to pass a step-up token to sensitive endpoints.
 * The token is a short-lived JWT (15 min) issued by POST /auth/step-up
 * after password re-verification.
 */
export const STEP_UP_TOKEN_HEADER = "x-step-up-token";

/**
 * Response body returned when step-up authentication is required.
 * The frontend uses `requiresStepUp: true` to trigger the password modal.
 */
export const STEP_UP_REQUIRED_RESPONSE = {
  error: "STEP_UP_REQUIRED",
  requiresStepUp: true,
};

interface StepUpPayload {
  sub: string;
  stepUp: boolean;
}

/**
 * Guard that enforces step-up authentication for sensitive endpoints.
 *
 * Behaviour:
 * - If a valid step-up token is present in `X-Step-Up-Token`: allow.
 * - Otherwise: throw 401 with `requiresStepUp: true` so the frontend can
 *   trigger the appropriate step-up flow (password modal for password users;
 *   silent token acquisition for OAuth-only users via POST /auth/step-up).
 *
 * All users must present a step-up token, regardless of whether they have a
 * password.  OAuth-only users can acquire a token by calling POST /auth/step-up
 * without a password; the AuthService issues one immediately in that case.
 * This ensures consistent security posture: a hijacked session cannot perform
 * sensitive actions without an additional explicit confirmation step.
 *
 * Must be used after JwtAuthGuard so that `request.user.userId` is populated.
 * (OWASP ASVS req 4.2.1 — step-up authentication for sensitive operations)
 */
@Injectable()
export class StepUpAuthGuard implements CanActivate {
  constructor(private jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = request.headers[STEP_UP_TOKEN_HEADER] as string | undefined;
    const userId = request.user?.userId as string | undefined;

    if (!userId) {
      throw new UnauthorizedException(STEP_UP_REQUIRED_RESPONSE);
    }

    if (token && this.validateStepUpToken(token, userId)) {
      return true;
    }

    throw new UnauthorizedException(STEP_UP_REQUIRED_RESPONSE);
  }

  private validateStepUpToken(token: string, userId: string): boolean {
    try {
      const payload = this.jwtService.verify<StepUpPayload>(token);
      return payload.stepUp === true && payload.sub === userId;
    } catch {
      return false;
    }
  }
}
