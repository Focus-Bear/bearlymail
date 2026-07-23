/**
 * Decision helper for the "no existing work → reveal, don't gate" Triage behaviour.
 *
 * The guided default shows High-and-above Triage emails and, once that list is
 * cleared, points the user at their pre-existing Action/Follow-Up work via the
 * "well done" prompt. But that prompt's whole premise is "you've got work to do
 * elsewhere". When Action and Follow-Up are genuinely empty (the session-start
 * snapshot is zero, across ALL priorities), there is nothing to point at — so instead
 * of gating we simply reveal the remaining lower-priority Triage threads.
 *
 * Extracted as a pure function (mirroring triageContentRegion.ts) so the precedence
 * is unit-testable without standing up the whole Inbox provider tree.
 */
import { HIGH_PRIORITY_THRESHOLD } from 'hooks/useInboxFilters';

interface PriorityTierCounts {
  veryHigh: number;
  high: number;
  medium: number;
  low: number;
  veryLow: number;
}

export interface RevealLowerPriorityTriageInput {
  /** True only in Triage mode — the reveal never applies elsewhere. */
  isTriage: boolean;
  /** The existing-work snapshot has been captured (or we're not in Triage). */
  isGateResolved: boolean;
  /** Action/Follow-Up work was waiting at session start (across all priorities). */
  hasExistingWork: boolean;
  /** Current priority filter lower bound. */
  minPriority: number | null;
  /** Current priority filter upper bound. */
  maxPriority: number | null;
  /** Per-tier thread counts for the current mode (null while loading). */
  priorityCounts: PriorityTierCounts | null;
  /** Whether the reveal has already fired this Triage session (latch). */
  alreadyRevealed: boolean;
}

/**
 * Should Triage auto-reveal its lower-priority threads instead of showing the gating
 * "well done" prompt? True only when: we're in Triage, the existing-work snapshot has
 * resolved to zero, the guided High-and-above view is active, its High-and-above tiers
 * are empty, and lower-priority threads still remain.
 */
export function shouldRevealLowerPriorityTriage({
  isTriage,
  isGateResolved,
  hasExistingWork,
  minPriority,
  maxPriority,
  priorityCounts,
  alreadyRevealed,
}: RevealLowerPriorityTriageInput): boolean {
  if (!isTriage || alreadyRevealed) {
    return false;
  }
  // Only act once the snapshot is known AND there is genuinely no other work waiting.
  if (!isGateResolved || hasExistingWork) {
    return false;
  }
  // Only the guided High-and-above view — never a manually chosen bounded bucket.
  if (minPriority !== HIGH_PRIORITY_THRESHOLD || maxPriority !== null || !priorityCounts) {
    return false;
  }
  const highAndAboveEmpty = priorityCounts.veryHigh === 0 && priorityCounts.high === 0;
  const lowerPriorityRemaining =
    priorityCounts.medium + priorityCounts.low + priorityCounts.veryLow > 0;
  return highAndAboveEmpty && lowerPriorityRemaining;
}
