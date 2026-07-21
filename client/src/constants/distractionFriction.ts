/**
 * Constants for the Triage "distraction tax" friction feature.
 *
 * When the user has unfinished work (Action or Follow-Up has emails), peeking at
 * lower-priority Triage emails requires a deliberate unlock exercise. See
 * `useDistractionFriction`.
 */

/**
 * The confession phrase the user must speak aloud (voice option). Kept in sync
 * with DISTRACTION_CONFESSION_PHRASE in server/src/triage/triage.constants.ts —
 * the server verifies the speech transcript against the same phrase.
 */
export const DISTRACTION_CONFESSION_PHRASE =
  'Please distract me with new emails even though I have existing emails to deal with.';

/** Number of consecutive taps required to pay the "tap tax" and unlock. */
export const DISTRACTION_TAP_TARGET = 30;

/** Which unlock exercise the user is doing in the friction modal. */
export const UNLOCK_METHOD = {
  VOICE: 'voice',
  TAP: 'tap',
} as const;
export type UnlockMethod = (typeof UNLOCK_METHOD)[keyof typeof UNLOCK_METHOD];
export const UNLOCK_METHODS: UnlockMethod[] = [
  UNLOCK_METHOD.VOICE,
  UNLOCK_METHOD.TAP,
];

/** State of the voice-confession verification flow. */
export const VERIFY_STATUS = {
  IDLE: 'idle',
  VERIFYING: 'verifying',
  REJECTED: 'rejected',
  ERROR: 'error',
} as const;
export type VerifyStatus = (typeof VERIFY_STATUS)[keyof typeof VERIFY_STATUS];

/**
 * Playful milestones shown as the tap counter climbs. Each entry applies once
 * the tap count reaches `at`; the highest matching entry wins. Emoji + an i18n
 * key suffix under `inbox.distractionTax.tapMilestone.*`.
 */
export interface TapMilestone {
  at: number;
  emoji: string;
  messageKey: string;
}

export const DISTRACTION_TAP_MILESTONES: TapMilestone[] = [
  { at: 0, emoji: '🐢', messageKey: 'start' },
  { at: 8, emoji: '🚶', messageKey: 'warmingUp' },
  { at: 15, emoji: '🏃', messageKey: 'halfway' },
  { at: 23, emoji: '🔥', messageKey: 'almost' },
  { at: 29, emoji: '🎉', messageKey: 'oneMore' },
];
