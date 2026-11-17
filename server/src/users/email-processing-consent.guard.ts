import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";

import { ERROR_MESSAGES } from "../constants/error-messages";
import { UsersService } from "./users.service";

/** Machine-readable code the client can use to detect a missing terms acceptance. */
export const TERMS_NOT_ACCEPTED_CODE = "TERMS_NOT_ACCEPTED";

/**
 * Refuses endpoints that read the user's mailbox (sync, history scan, context
 * analysis) until the Terms of Use are accepted, so a client that skips the
 * first onboarding step still can't start processing their email. Apply AFTER
 * JwtAuthGuard so request.user is populated.
 */
@Injectable()
export class EmailProcessingConsentGuard implements CanActivate {
  constructor(private readonly usersService: UsersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<{ user?: { userId?: string } }>();
    const userId = request.user?.userId;
    if (userId && (await this.usersService.hasEmailProcessingConsent(userId))) {
      return true;
    }
    throw new ForbiddenException({
      message: ERROR_MESSAGES.TERMS_NOT_ACCEPTED,
      code: TERMS_NOT_ACCEPTED_CODE,
    });
  }
}
