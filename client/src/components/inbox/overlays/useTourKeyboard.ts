import { useEffect, useRef } from 'react';

import { KEY_ARROW_LEFT, KEY_ARROW_RIGHT, KEY_ENTER, KEY_ESCAPE } from 'constants/strings';
import { TOUR_HOLD_TO_SKIP_ATTRIBUTE } from 'constants/tour';

interface TourKeyboardHandlers {
  isFirstStep: boolean;
  /** Esc: opens (or closes) the hold-to-skip prompt — it never skips outright. */
  onEscape: () => void;
  onNext: () => void;
  onPrev: () => void;
}

const NO_OP = () => {};

function isButton(target: EventTarget | null): boolean {
  return target instanceof HTMLButtonElement;
}

function isHoldToSkipButton(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(`[${TOUR_HOLD_TO_SKIP_ATTRIBUTE}]`) !== null;
}

/**
 * Esc opens the hold-to-skip prompt, →/Enter go forward and ← goes back. Listens in the capture
 * phase and stops these keys so the inbox's own shortcuts (arrow navigation,
 * Enter to open…) don't fire underneath the tour. Enter on a focused tour button
 * is left to the browser so the button the user is on is the one activated, and
 * Enter on the hold-to-skip button is left to that button, which needs the key
 * held down rather than pressed.
 */
export function useTourKeyboard(handlers: TourKeyboardHandlers): void {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === KEY_ENTER && isHoldToSkipButton(event.target)) {
        return;
      }
      const { isFirstStep, onEscape, onNext, onPrev } = handlersRef.current;
      const actions: Record<string, () => void> = {
        [KEY_ESCAPE]: onEscape,
        [KEY_ARROW_RIGHT]: onNext,
        [KEY_ARROW_LEFT]: isFirstStep ? NO_OP : onPrev,
        [KEY_ENTER]: onNext,
      };
      const action = actions[event.key];
      if (!action) {
        return;
      }
      event.stopPropagation();
      const isNativeButtonActivation = event.key === KEY_ENTER && isButton(event.target);
      if (isNativeButtonActivation) {
        return;
      }
      event.preventDefault();
      action();
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, []);
}
