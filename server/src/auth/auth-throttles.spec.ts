import { AskAiController } from "../ask-ai/ask-ai.controller";
import { MILLISECONDS } from "../constants/time-constants";
import { AuthController } from "./auth.controller";

// Metadata key @nestjs/throttler's @Throttle() writes for the "default" tier.
const DEFAULT_TIER_TTL_KEY = "THROTTLER:TTLdefault";
const FORGOT_PASSWORD_WINDOW_MINUTES = 5;

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
      "forgot-password",
      AuthController.prototype.forgotPassword,
      FORGOT_PASSWORD_WINDOW_MINUTES * MILLISECONDS.MINUTE,
    ],
    ["step-up", AuthController.prototype.issueStepUpToken, MILLISECONDS.MINUTE],
    ["mfa/verify", AuthController.prototype.mfaVerify, MILLISECONDS.MINUTE],
    ["ask-email", AskAiController.prototype.askEmail, MILLISECONDS.MINUTE],
    [
      "ask-email/stream",
      AskAiController.prototype.streamEmail,
      MILLISECONDS.MINUTE,
    ],
  ])("%s window is expressed in milliseconds", (_route, handler, expected) => {
    expect(throttleTtlOf(handler)).toBe(expected);
  });
});
