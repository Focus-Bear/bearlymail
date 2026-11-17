import { AskAiController } from "../ask-ai/ask-ai.controller";
import { MILLISECONDS } from "../constants/time-constants";
import { AuthController } from "./auth.controller";
import { EmailVerificationController } from "./email-verification.controller";

// Metadata key @nestjs/throttler's @Throttle() writes for the "default" tier.
const DEFAULT_TIER_TTL_KEY = "THROTTLER:TTLdefault";
const FIVE_MINUTES_MS = 5 * MILLISECONDS.MINUTE;

function throttleTtlOf(handler: object): number {
  return Reflect.getMetadata(DEFAULT_TIER_TTL_KEY, handler) as number;
}

describe("auth and Ask AI throttle windows", () => {
  // @nestjs/throttler v5+ reads ttl in milliseconds; a seconds value (60) makes
  // the window 60 ms and the limit meaningless.
  it.each([
    ["login", AuthController.prototype.login, MILLISECONDS.MINUTE],
    ["register", AuthController.prototype.register, MILLISECONDS.MINUTE],
    [
      "setup-password",
      AuthController.prototype.setupPassword,
      MILLISECONDS.MINUTE,
    ],
    [
      "forgot-password",
      AuthController.prototype.forgotPassword,
      FIVE_MINUTES_MS,
    ],
    [
      "reset-password",
      AuthController.prototype.resetPassword,
      MILLISECONDS.MINUTE,
    ],
    ["step-up", AuthController.prototype.issueStepUpToken, MILLISECONDS.MINUTE],
    ["mfa/verify", AuthController.prototype.mfaVerify, MILLISECONDS.MINUTE],
    [
      "verify-email",
      EmailVerificationController.prototype.verifyEmail,
      MILLISECONDS.MINUTE,
    ],
    [
      "resend-verification",
      EmailVerificationController.prototype.resendVerification,
      FIVE_MINUTES_MS,
    ],
    ["ask-email", AskAiController.prototype.askEmail, MILLISECONDS.MINUTE],
    [
      "ask-email/stream",
      AskAiController.prototype.streamEmail,
      MILLISECONDS.MINUTE,
    ],
    [
      "ask-email/tool-approval/stream",
      AskAiController.prototype.streamToolDecision,
      MILLISECONDS.MINUTE,
    ],
  ])("%s window is expressed in milliseconds", (_route, handler, expected) => {
    expect(throttleTtlOf(handler)).toBe(expected);
  });
});
