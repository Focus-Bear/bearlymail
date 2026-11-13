import { ForbiddenException } from "@nestjs/common";

import { AUTH_ERROR_CODES } from "../../constants/auth-security.constants";

/**
 * Thrown at password sign-in (after the password matched) when the account's
 * email address hasn't been verified yet. Carries the EMAIL_NOT_VERIFIED
 * code so the client can show "check your inbox" with a resend button.
 */
export class EmailNotVerifiedException extends ForbiddenException {
  constructor() {
    super({
      statusCode: 403,
      error: AUTH_ERROR_CODES.EMAIL_NOT_VERIFIED,
      message:
        "Please confirm your email address first. We've sent a link to your inbox.",
    });
  }
}
