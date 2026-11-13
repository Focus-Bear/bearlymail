export interface GoogleProfile {
  id: string;
  /** `verified` is Google's `email_verified` claim. */
  emails: Array<{ value: string; verified?: boolean | string }>;
  displayName?: string;
}

const GOOGLE_VERIFIED_CLAIM_TRUE = "true";

/**
 * Google only vouches for an address whose `email_verified` claim is true.
 * passport-google-oauth20 copies the claim onto `emails[0].verified`, as a
 * boolean (or the string "true" from older userinfo responses).
 */
export function isGoogleEmailVerified(profile: GoogleProfile): boolean {
  const verified = profile.emails[0]?.verified;
  return verified === true || verified === GOOGLE_VERIFIED_CLAIM_TRUE;
}
