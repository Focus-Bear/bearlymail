import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";

import { AUTH_THROTTLES } from "../constants/auth-security.constants";
import {
  ResendVerificationDto,
  VerifyEmailDto,
} from "./dto/email-verification.dto";
import { EmailVerificationService } from "./email-verification.service";

/** Public endpoints for confirming the email address of a password sign-up. */
@Controller("auth")
export class EmailVerificationController {
  constructor(
    private readonly emailVerificationService: EmailVerificationService,
  ) {}

  /** Redeems the emailed link. The user then signs in with their password. */
  @Post("verify-email")
  @HttpCode(HttpStatus.OK)
  @Throttle(AUTH_THROTTLES.VERIFY_EMAIL)
  async verifyEmail(@Body() body: VerifyEmailDto) {
    await this.emailVerificationService.verifyEmail(body.token);
    return { verified: true };
  }

  /**
   * Emails a fresh link if the address has an unverified password account.
   * Always answers the same way, so it never reveals whether one exists.
   */
  @Post("resend-verification")
  @HttpCode(HttpStatus.OK)
  @Throttle(AUTH_THROTTLES.RESEND_VERIFICATION)
  async resendVerification(@Body() body: ResendVerificationDto) {
    await this.emailVerificationService.resendVerification(body.email);
    return {
      success: true,
      message:
        "If that address has an account waiting for verification, we've sent a new link.",
    };
  }
}
