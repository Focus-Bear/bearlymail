import { RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { flyGhostToTarget } from 'utils/flyGhostToTarget';

import {
  ACTION_MOVE_FLIGHT_STYLE,
  ACTION_MOVE_TOAST_DURATION_MS,
  ACTION_TAB_EMPHASIS,
  ActionTabEmphasis,
  FIRST_PRIORITISE_SEEN_STORAGE_KEY_PREFIX,
} from 'constants/actionMove';
import { usePrefersReducedMotion } from 'hooks/usePrefersReducedMotion';

/** Screen readers skip a live-region update whose text is unchanged, so repeats alternate a trailing space. */
const REPEAT_ANNOUNCEMENT_SUFFIX = ' ';

function firstPrioritiseStorageKey(userId: string): string {
  return `${FIRST_PRIORITISE_SEEN_STORAGE_KEY_PREFIX}${userId}`;
}

function hasSeenFirstPrioritise(userId: string): boolean {
  try {
    return localStorage.getItem(firstPrioritiseStorageKey(userId)) !== null;
  } catch {
    // Storage blocked: treat as seen so a blocked browser isn't shown the loud version every time.
    return true;
  }
}

function markFirstPrioritiseSeen(userId: string): void {
  try {
    localStorage.setItem(firstPrioritiseStorageKey(userId), new Date().toISOString());
  } catch {
    // Storage blocked — the celebration simply may repeat next session.
  }
}

/** Claims the one-off celebration: true only the first time it is called for a user. */
function claimFirstPrioritise(userId: string | undefined): boolean {
  if (!userId || hasSeenFirstPrioritise(userId)) {
    return false;
  }
  markFirstPrioritiseSeen(userId);
  return true;
}

function findEmailRow(emailId: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-email-id="${CSS.escape(emailId)}"]`);
}

interface UseActionMoveFeedbackParams {
  userId: string | undefined;
  isActionTabActive: boolean;
  actionTabRef: RefObject<HTMLButtonElement | null>;
  onViewActionTab: () => void;
}

export interface ActionMoveFeedback {
  /** Animation currently playing on the Action tab, or null when it is at rest. */
  tabEmphasis: ActionTabEmphasis | null;
  /** Emails moved to Action since the user last looked at it. */
  movedCount: number;
  isToastVisible: boolean;
  /** Text for the polite live region that tells screen-reader users where the email went. */
  announcement: string;
  onEmailPrioritised: (emailId: string, subject?: string) => void;
  onTabEmphasisEnd: () => void;
  dismissToast: () => void;
  viewActionTab: () => void;
}

/** Polite live-region text; a repeated message alternates a trailing space so it is re-read. */
function useLiveAnnouncement() {
  const [announcement, setAnnouncement] = useState('');
  const countRef = useRef(0);
  const announce = useCallback((message: string) => {
    countRef.current += 1;
    const isRepeat = countRef.current % 2 === 0;
    setAnnouncement(isRepeat ? `${message}${REPEAT_ANNOUNCEMENT_SUFFIX}` : message);
  }, []);
  return { announcement, announce };
}

function useTimedToast(durationMs: number) {
  const [isToastVisible, setIsToastVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => clearTimer, [clearTimer]);

  const dismissToast = useCallback(() => {
    clearTimer();
    setIsToastVisible(false);
  }, [clearTimer]);

  const showToast = useCallback(() => {
    clearTimer();
    setIsToastVisible(true);
    timerRef.current = setTimeout(dismissToast, durationMs);
  }, [clearTimer, dismissToast, durationMs]);

  return { isToastVisible, showToast, dismissToast };
}

/**
 * Removing then re-adding the class on the next frame restarts the CSS animation,
 * so back-to-back prioritisations each get their own bounce.
 */
function useRestartableTabEmphasis() {
  const [tabEmphasis, setTabEmphasis] = useState<ActionTabEmphasis | null>(null);
  const frameRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }
    },
    []
  );

  const restartTabEmphasis = useCallback((emphasis: ActionTabEmphasis) => {
    setTabEmphasis(null);
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
    }
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      setTabEmphasis(emphasis);
    });
  }, []);

  const onTabEmphasisEnd = useCallback(() => setTabEmphasis(null), []);

  return { tabEmphasis, restartTabEmphasis, onTabEmphasisEnd };
}

/** Emails moved to Action since the user last opened it; opening the tab clears it. */
function useMovedCount(isActionTabActive: boolean) {
  const [movedCount, setMovedCount] = useState(0);
  useEffect(() => {
    if (isActionTabActive) {
      setMovedCount(0);
    }
  }, [isActionTabActive]);
  const incrementMovedCount = useCallback(() => setMovedCount(count => count + 1), []);
  return { movedCount, incrementMovedCount };
}

/**
 * Makes a prioritised email's move to the Action tab visible: the email flies to the tab,
 * the tab bounces with a "+N" badge and, the first time only, a toast explains what Action is.
 * With reduced motion the flight and bounce are skipped — the toast and badge still appear.
 */
export function useActionMoveFeedback({
  userId,
  isActionTabActive,
  actionTabRef,
  onViewActionTab,
}: UseActionMoveFeedbackParams): ActionMoveFeedback {
  const { t } = useTranslation();
  const prefersReducedMotion = usePrefersReducedMotion();
  const { announcement, announce } = useLiveAnnouncement();
  const { isToastVisible, showToast, dismissToast } = useTimedToast(ACTION_MOVE_TOAST_DURATION_MS);
  const { tabEmphasis, restartTabEmphasis, onTabEmphasisEnd } = useRestartableTabEmphasis();
  const { movedCount, incrementMovedCount } = useMovedCount(isActionTabActive);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const land = useCallback(
    (emphasis: ActionTabEmphasis) => {
      if (!isMountedRef.current) {
        return;
      }
      incrementMovedCount();
      if (!prefersReducedMotion) {
        restartTabEmphasis(emphasis);
      }
    },
    [incrementMovedCount, prefersReducedMotion, restartTabEmphasis]
  );

  const onEmailPrioritised = useCallback(
    (emailId: string, subject?: string) => {
      const tab = actionTabRef.current;
      // Views without the tab bar (focused inbox) have nowhere to point, so they mustn't
      // use up the one-off celebration either.
      if (!tab) {
        announce(t('inbox.actionMove.announcement'));
        return;
      }
      const isFirstTime = claimFirstPrioritise(userId);
      const emphasis = isFirstTime ? ACTION_TAB_EMPHASIS.FIRST_TIME : ACTION_TAB_EMPHASIS.SUBTLE;
      announce(t(isFirstTime ? 'inbox.actionMove.announcementFirst' : 'inbox.actionMove.announcement'));
      if (isFirstTime) {
        showToast();
      }
      const row = findEmailRow(emailId);
      if (prefersReducedMotion || !row) {
        land(emphasis);
        return;
      }
      const label = subject || t('inbox.actionMove.ghostFallback');
      void flyGhostToTarget(
        row.getBoundingClientRect(),
        tab.getBoundingClientRect(),
        label,
        ACTION_MOVE_FLIGHT_STYLE[emphasis]
      ).then(() => land(emphasis));
    },
    [actionTabRef, announce, t, userId, showToast, prefersReducedMotion, land]
  );

  const viewActionTab = useCallback(() => {
    dismissToast();
    onViewActionTab();
  }, [dismissToast, onViewActionTab]);

  return useMemo(
    () => ({
      tabEmphasis,
      movedCount,
      isToastVisible,
      announcement,
      onEmailPrioritised,
      onTabEmphasisEnd,
      dismissToast,
      viewActionTab,
    }),
    [tabEmphasis, movedCount, isToastVisible, announcement, onEmailPrioritised, onTabEmphasisEnd, dismissToast, viewActionTab]
  );
}
