import { hasEmailProcessingConsent } from "./email-processing-consent";

describe("hasEmailProcessingConsent", () => {
  it("refuses a new user who hasn't accepted the terms yet", () => {
    expect(
      hasEmailProcessingConsent({
        termsAcceptedAt: null,
        hasCompletedOnboarding: false,
      }),
    ).toBe(false);
  });

  it("allows a user once the terms acceptance is recorded", () => {
    expect(
      hasEmailProcessingConsent({
        termsAcceptedAt: new Date("2026-11-10T09:00:00Z"),
        hasCompletedOnboarding: false,
      }),
    ).toBe(true);
  });

  it("keeps syncing users who finished onboarding before acceptance was recorded", () => {
    expect(
      hasEmailProcessingConsent({
        termsAcceptedAt: null,
        hasCompletedOnboarding: true,
      }),
    ).toBe(true);
  });

  it("refuses a missing user", () => {
    expect(hasEmailProcessingConsent(null)).toBe(false);
  });
});
