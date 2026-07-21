/**
 * The confession phrase a user must speak aloud to unlock lower-priority
 * ("distraction") emails in Triage while they still have existing work waiting.
 *
 * Kept as a single source of truth: the client shows it, and the LLM verifier
 * receives it as the target phrase to match the (rough) speech transcript against.
 */
export const DISTRACTION_CONFESSION_PHRASE =
  "Please distract me with new emails even though I have existing emails to deal with.";

/** Token budget for the distraction-phrase verification call (tiny JSON reply). */
export const VERIFY_DISTRACTION_PHRASE_MAX_TOKENS = 50;
