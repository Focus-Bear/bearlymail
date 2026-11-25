import { useCallback, useEffect, useRef, useState } from 'react';

import { SAVE_CONFIRMATION_DURATION_MS } from 'constants/numbers';

/** Pause after the last keystroke before a text field saves. */
export const AUTOSAVE_TYPING_DELAY_MS = 1000;

export const AUTOSAVE_STATUS = {
  IDLE: 'idle',
  SAVING: 'saving',
  SAVED: 'saved',
  ERROR: 'error',
} as const;

export type AutosaveStatus = (typeof AUTOSAVE_STATUS)[keyof typeof AUTOSAVE_STATUS];

export interface Autosave<T> {
  status: AutosaveStatus;
  /** Save after a pause (text fields): each call restarts the wait. */
  saveSoon: (value: T) => void;
  /** Save straight away (clicks, dropdowns). */
  saveNow: (value: T) => void;
  /** Send the value that last failed again. */
  retry: () => void;
}

const NOTHING_QUEUED = Symbol('nothing-queued');

/**
 * Saves a setting as the user changes it, with no Save button (#482).
 *
 * Only one request is in flight at a time: a change made while one is saving
 * waits and then sends the newest value, so an older value can never land
 * after a newer one. A change still waiting when the section unmounts (the
 * user left Settings mid-sentence) is sent at once rather than dropped.
 */
export function useAutosave<T>(
  save: (value: T) => Promise<void>,
  typingDelayMs = AUTOSAVE_TYPING_DELAY_MS
): Autosave<T> {
  const [status, setStatus] = useState<AutosaveStatus>(AUTOSAVE_STATUS.IDLE);
  const saveRef = useRef(save);
  saveRef.current = save;
  const isMountedRef = useRef(true);
  const isSavingRef = useRef(false);
  const queuedRef = useRef<T | typeof NOTHING_QUEUED>(NOTHING_QUEUED);
  const waitingRef = useRef<T | typeof NOTHING_QUEUED>(NOTHING_QUEUED);
  const lastFailedRef = useRef<T | typeof NOTHING_QUEUED>(NOTHING_QUEUED);
  const typingTimerRef = useRef<number | undefined>(undefined);
  const savedTimerRef = useRef<number | undefined>(undefined);

  const setStatusIfMounted = useCallback((next: AutosaveStatus) => {
    if (isMountedRef.current) {
      setStatus(next);
    }
  }, []);

  const send = useCallback(
    async (value: T): Promise<void> => {
      if (isSavingRef.current) {
        queuedRef.current = value;
        return;
      }
      isSavingRef.current = true;
      window.clearTimeout(savedTimerRef.current);
      setStatusIfMounted(AUTOSAVE_STATUS.SAVING);
      let failed = false;
      try {
        await saveRef.current(value);
        lastFailedRef.current = NOTHING_QUEUED;
      } catch {
        failed = true;
        lastFailedRef.current = value;
      }
      isSavingRef.current = false;

      const queued = queuedRef.current;
      if (queued !== NOTHING_QUEUED) {
        queuedRef.current = NOTHING_QUEUED;
        await send(queued);
        return;
      }
      if (failed) {
        setStatusIfMounted(AUTOSAVE_STATUS.ERROR);
        return;
      }
      setStatusIfMounted(AUTOSAVE_STATUS.SAVED);
      savedTimerRef.current = window.setTimeout(
        () => setStatusIfMounted(AUTOSAVE_STATUS.IDLE),
        SAVE_CONFIRMATION_DURATION_MS
      );
    },
    [setStatusIfMounted]
  );

  const saveNow = useCallback(
    (value: T) => {
      window.clearTimeout(typingTimerRef.current);
      waitingRef.current = NOTHING_QUEUED;
      void send(value);
    },
    [send]
  );

  const saveSoon = useCallback(
    (value: T) => {
      window.clearTimeout(typingTimerRef.current);
      waitingRef.current = value;
      typingTimerRef.current = window.setTimeout(() => {
        waitingRef.current = NOTHING_QUEUED;
        void send(value);
      }, typingDelayMs);
    },
    [send, typingDelayMs]
  );

  const retry = useCallback(() => {
    const failed = lastFailedRef.current;
    if (failed !== NOTHING_QUEUED) {
      saveNow(failed);
    }
  }, [saveNow]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      window.clearTimeout(typingTimerRef.current);
      window.clearTimeout(savedTimerRef.current);
      const waiting = waitingRef.current;
      if (waiting !== NOTHING_QUEUED) {
        waitingRef.current = NOTHING_QUEUED;
        void send(waiting);
      }
    };
  }, [send]);

  return { status, saveSoon, saveNow, retry };
}
