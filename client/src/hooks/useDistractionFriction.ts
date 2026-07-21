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
  minPriority: number;
  maxPriority: number | null;
}

export interface UseDistractionFrictionParams {
  mode: InboxMode;
  tabCounts: TabCounts | null;
}

export interface UseDistractionFrictionResult {
  /** True when the user has unfinished work (Action or Follow-Up has emails). */
  hasExistingWork: boolean;
  /** True when peeking below the floor requires the unlock exercise. */
  isGateActive: boolean;
  /** Effective minimum priority to enforce while gated ("High and above"). */
  floor: number;
  /** True once the user has paid the tax this Triage session. */
  isUnlocked: boolean;
  /** Whether the friction modal is currently shown. */
  isModalOpen: boolean;
  /**
   * Whether the full-screen entry gate (pre-screen) should be shown. It appears
   * before the friction modal whenever the gate is active and the user has not
   * yet chosen to proceed from it this session.
   */
  isPreScreenOpen: boolean;
  /**
   * Advance from the pre-screen to the friction modal. Opens the modal with NO
   * deferred tier target, so completing the exercise reveals the whole inbox
   * rather than a single tier.
   */
  proceedFromPreScreen: () => void;
  /**
   * Called when the user attempts to reveal a lower tier. Returns true if the
   * attempt was intercepted (friction modal opened, unlock deferred); false if
   * the caller should proceed with the unlock normally.
   */
  requestUnlock: (minPriority: number, maxPriority: number | null) => boolean;
  /**
   * Mark the exercise complete: unlocks the session, closes the modal, and
   * returns the deferred unlock target (if any) for the caller to apply.
   */
  completeUnlock: () => PendingUnlockTarget | null;
  /** Close the friction modal without unlocking (user backed out). */
  dismissModal: () => void;
}

/**
 * "Distraction tax" gating for Triage.
 *
 * When the user still has unfinished work, revealing lower-priority Triage
 * emails (Medium and below) is gated behind a deliberate unlock exercise. The
 * gate is session-scoped: it re-locks whenever the user leaves Triage (state is
 * never persisted). Integrates with the existing progressive-unlock tier system
 * by intercepting lower-tier unlock attempts.
 */
export function useDistractionFriction({
  mode,
  tabCounts,
}: UseDistractionFrictionParams): UseDistractionFrictionResult {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [preScreenDone, setPreScreenDone] = useState(false);
  const pendingTargetRef = useRef<PendingUnlockTarget | null>(null);

  const isTriage = mode === MODE_TRIAGE;
  const hasExistingWork = tabCounts !== null && (tabCounts.action > 0 || tabCounts.followUp > 0);
  const isGateActive = isTriage && hasExistingWork && !isUnlocked;
  const isPreScreenOpen = isGateActive && !preScreenDone;

  // Session-scoped: re-lock (and close any open modal) whenever the user leaves
  // Triage. Switching away and back therefore restores the friction (including
  // the pre-screen). State is never persisted.
  useEffect(() => {
    if (!isTriage) {
      setIsUnlocked(false);
      setIsModalOpen(false);
      setPreScreenDone(false);
      pendingTargetRef.current = null;
    }
  }, [isTriage]);

  const proceedFromPreScreen = useCallback(() => {
    // Advance to the friction exercise with no deferred tier target, so
    // completing it reveals the whole inbox rather than a single tier.
    pendingTargetRef.current = null;
    setPreScreenDone(true);
    setIsModalOpen(true);
  }, []);

  const requestUnlock = useCallback(
    (minPriority: number, maxPriority: number | null): boolean => {
      // Only intercept attempts to drop BELOW the floor while gated. Unlocking
      // to High-and-above, or when there is no existing work, is frictionless.
      if (!isGateActive || minPriority >= HIGH_PRIORITY_THRESHOLD) {
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
    isGateActive,
    floor: HIGH_PRIORITY_THRESHOLD,
    isUnlocked,
    isModalOpen,
    isPreScreenOpen,
    proceedFromPreScreen,
    requestUnlock,
    completeUnlock,
    dismissModal,
  };
}
