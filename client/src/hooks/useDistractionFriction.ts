import { useCallback, useEffect, useRef, useState } from 'react';
import { InboxMode } from 'types/email';

import { MODE_TRIAGE } from 'constants/strings';
import { HIGH_PRIORITY_THRESHOLD } from 'hooks/useInboxFilters';

interface TabCounts {
  triage: number;
  action: number;
  followUp: number;
}

/** A deferred priority-tier unlock target captured while the friction modal is open. */
export interface PendingUnlockTarget {
  minPriority: number | null;
  maxPriority: number | null;
}

/**
 * Action + Follow-Up counts captured once at the start of a Triage session. These
 * are what "existing work" means for the gate/prompt — NOT the live tab counts.
 */
interface ExistingWorkSnapshot {
  action: number;
  followUp: number;
}

export interface UseDistractionFrictionParams {
  mode: InboxMode;
  tabCounts: TabCounts | null;
}

export interface UseDistractionFrictionResult {
  /** True when the user had unfinished work (Action or Follow-Up) at session start. */
  hasExistingWork: boolean;
  /** Action conversations already waiting when this Triage session began. */
  existingActionCount: number;
  /** Follow-Up conversations already waiting when this Triage session began. */
  existingFollowUpCount: number;
  /** True when peeking below High requires the unlock exercise (existing work + not unlocked). */
  isGateActive: boolean;
  /**
   * True once we know whether the gate applies — i.e. the session-start snapshot has
   * been captured (or we are not in Triage). While this is false in Triage, callers
   * must hold off rendering the Triage content so the post-clear prompt can't flash
   * with stale/zero counts before the snapshot settles.
   */
  isGateResolved: boolean;
  /** True once the user has paid the tax this Triage session. */
  isUnlocked: boolean;
  /** Whether the friction unlock exercise is currently shown (inline, in place of the list). */
  isModalOpen: boolean;
  /**
   * Called when the user attempts to peek at a lower tier (below High). Returns true
   * if the attempt was intercepted (friction modal opened, unlock deferred); false if
   * the caller should proceed with the unlock normally (no existing work, or the
   * target is High-and-above).
   */
  requestUnlock: (minPriority: number | null, maxPriority: number | null) => boolean;
  /**
   * Mark the exercise complete: unlocks the session, closes the modal, and returns
   * the deferred unlock target (if any) for the caller to apply.
   */
  completeUnlock: () => PendingUnlockTarget | null;
  /** Close the friction modal without unlocking (user backed out). */
  dismissModal: () => void;
}

/** True when a target priority range peeks BELOW the High floor. */
function isBelowHighFloor(minPriority: number | null): boolean {
  return minPriority === null || minPriority < HIGH_PRIORITY_THRESHOLD;
}

/**
 * "Distraction tax" gating for Triage.
 *
 * The guided default shows High-and-above emails for free. Peeking at the
 * lower-priority (Medium and below) Triage emails is gated behind a deliberate
 * unlock exercise, but ONLY when the user still had unfinished work when the
 * session began. "Existing work" is a snapshot of the Action + Follow-Up counts
 * captured at session start — so moving emails to Action/Follow-Up while triaging
 * does NOT retroactively trigger the gate. The gate is session-scoped: it re-locks
 * (and re-snapshots) whenever the user leaves Triage. State is never persisted.
 */
export function useDistractionFriction({
  mode,
  tabCounts,
}: UseDistractionFrictionParams): UseDistractionFrictionResult {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<ExistingWorkSnapshot | null>(null);
  const pendingTargetRef = useRef<PendingUnlockTarget | null>(null);

  const isTriage = mode === MODE_TRIAGE;

  // Capture the existing-work snapshot once per Triage session, as soon as tab
  // counts are available. Later changes to the live counts (e.g. the user stars an
  // email into Action mid-session) do NOT update the snapshot.
  useEffect(() => {
    if (isTriage && snapshot === null && tabCounts !== null) {
      setSnapshot({ action: tabCounts.action, followUp: tabCounts.followUp });
    }
  }, [isTriage, snapshot, tabCounts]);

  // Session-scoped: re-lock (close any open modal) and drop the snapshot whenever
  // the user leaves Triage. Switching away and back restores the friction and
  // re-snapshots existing work from the then-current counts.
  useEffect(() => {
    if (!isTriage) {
      setIsUnlocked(false);
      setIsModalOpen(false);
      setSnapshot(null);
      pendingTargetRef.current = null;
    }
  }, [isTriage]);

  const existingActionCount = snapshot?.action ?? 0;
  const existingFollowUpCount = snapshot?.followUp ?? 0;
  const hasExistingWork = existingActionCount > 0 || existingFollowUpCount > 0;
  const isGateActive = isTriage && hasExistingWork && !isUnlocked;
  // Existing-work is unknown until the snapshot is captured; outside Triage the
  // gate never applies, so it is trivially resolved there.
  const isGateResolved = !isTriage || snapshot !== null;

  const requestUnlock = useCallback(
    (minPriority: number | null, maxPriority: number | null): boolean => {
      // Only intercept peeks BELOW High while gated. Staying at High-and-above, or
      // peeking when there was no existing work at session start, is frictionless.
      if (!isGateActive || !isBelowHighFloor(minPriority)) {
        return false;
      }
      pendingTargetRef.current = { minPriority, maxPriority };
      setIsModalOpen(true);
      return true;
    },
    [isGateActive]
  );

  const completeUnlock = useCallback((): PendingUnlockTarget | null => {
    setIsUnlocked(true);
    setIsModalOpen(false);
    const target = pendingTargetRef.current;
    pendingTargetRef.current = null;
    return target;
  }, []);

  const dismissModal = useCallback(() => {
    setIsModalOpen(false);
    pendingTargetRef.current = null;
  }, []);

  return {
    hasExistingWork,
    existingActionCount,
    existingFollowUpCount,
    isGateActive,
    isGateResolved,
    isUnlocked,
    isModalOpen,
    requestUnlock,
    completeUnlock,
    dismissModal,
  };
}
