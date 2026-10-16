import { useEffect, useRef } from 'react';

import { KEY_ARROW_LEFT, KEY_ARROW_RIGHT, KEY_ENTER, KEY_ESCAPE } from 'constants/strings';

interface TourKeyboardHandlers {
  isFirstStep: boolean;
  onSkip: () => void;
  onNext: () => void;
  onPrev: () => void;
}

const NO_OP = () => {};

function isButton(target: EventTarget | null): boolean {
  return target instanceof HTMLButtonElement;
}

/**
 * Esc skips the tour, →/Enter go forward and ← goes back. Listens in the capture
 * phase and stops these keys so the inbox's own shortcuts (arrow navigation,
 * Enter to open…) don't fire underneath the tour. Enter on a focused tour button
 * is left to the browser so the button the user is on is the one activated.
 */
export function useTourKeyboard(handlers: TourKeyboardHandlers): void {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const { isFirstStep, onSkip, onNext, onPrev } = handlersRef.current;
      const actions: Record<string, () => void> = {
        [KEY_ESCAPE]: onSkip,
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
