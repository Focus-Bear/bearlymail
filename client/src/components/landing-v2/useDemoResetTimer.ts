import { useCallback, useEffect, useRef } from 'react';

import { RESET_AFTER_MS } from './constants';

export interface DemoResetTimer {
  /** Arms (or re-arms) the auto-reset countdown after an interaction. */
  scheduleReset: () => void;
  /** Re-arms the countdown only if a reset is already pending. */
  rescheduleIfPending: () => void;
  /** Pauses the countdown while the pointer is over the demo. */
  pauseReset: () => void;
  /** Resumes a pending countdown once the pointer leaves the demo. */
  resumeReset: () => void;
  /** Cancels any pending reset (used by the manual restart control). */
  cancelReset: () => void;
}

/**
 * Idle-aware auto-reset timer for the live demo. Every interaction re-arms the
 * countdown, the countdown pauses while the pointer hovers the demo, and it
 * resumes on pointer leave — so the demo never resets mid-exploration.
 */
export function useDemoResetTimer(reset: () => void): DemoResetTimer {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef(false);
  const hoveringRef = useRef(false);
  const resetRef = useRef(reset);

  useEffect(() => {
    resetRef.current = reset;
  }, [reset]);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    clearTimer();
    timerRef.current = setTimeout(() => {
      pendingRef.current = false;
      resetRef.current();
    }, RESET_AFTER_MS);
  }, [clearTimer]);

  const scheduleReset = useCallback(() => {
    pendingRef.current = true;
    if (!hoveringRef.current) {
      startTimer();
    }
  }, [startTimer]);

  const rescheduleIfPending = useCallback(() => {
    if (pendingRef.current) {
      scheduleReset();
    }
  }, [scheduleReset]);

  const pauseReset = useCallback(() => {
    hoveringRef.current = true;
    clearTimer();
  }, [clearTimer]);

  const resumeReset = useCallback(() => {
    hoveringRef.current = false;
    if (pendingRef.current) {
      startTimer();
    }
  }, [startTimer]);

  const cancelReset = useCallback(() => {
    pendingRef.current = false;
    clearTimer();
  }, [clearTimer]);

  useEffect(() => () => clearTimer(), [clearTimer]);

  return { scheduleReset, rescheduleIfPending, pauseReset, resumeReset, cancelReset };
}
