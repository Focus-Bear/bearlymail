import type { User } from "../database/entities/user.entity";

/** The fields that decide whether BearlyMail may touch a user's mailbox. */
export type EmailProcessingConsentFields = Pick<
  User,
  "termsAcceptedAt" | "hasCompletedOnboarding"
>;

/**
 * Whether BearlyMail may fetch, sync or categorise this user's email.
 *
 * A new user only gives that permission by accepting the Terms of Use on the
 * first onboarding step, so nothing is read from their mailbox before then.
 * Users who finished onboarding before acceptance was recorded keep syncing:
 * any version counts, because a newer terms version is re-accepted through the
 * consent modal and must not silently stop an existing inbox from updating.
 */
export function hasEmailProcessingConsent(
  user: EmailProcessingConsentFields | null | undefined,
): boolean {
  if (!user) {
    return false;
  }
  return Boolean(user.termsAcceptedAt) || user.hasCompletedOnboarding === true;
}
