import { useCallback, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/** History-entry state holding the wizard step that entry shows. */
export const SETUP_STEP_STATE_KEY = 'bearlymailSetupStep';

/** If the browser never reports the rewind, finish anyway rather than strand the user. */
const REWIND_FALLBACK_MS = 1000;

const STEP_BACK = -1;

function readStepFromState<Step extends string>(state: unknown, steps: readonly Step[]): Step | null {
  if (typeof state !== 'object' || state === null || !(SETUP_STEP_STATE_KEY in state)) {
    return null;
  }
  const step = (state as Record<typeof SETUP_STEP_STATE_KEY, unknown>)[SETUP_STEP_STATE_KEY];
  return steps.find(candidate => candidate === step) ?? null;
}

function waitForHistoryPop(): Promise<void> {
  return new Promise(resolve => {
    const finish = () => {
      window.removeEventListener('popstate', finish);
      clearTimeout(fallbackTimer);
      resolve();
    };
    const fallbackTimer = setTimeout(finish, REWIND_FALLBACK_MS);
    window.addEventListener('popstate', finish);
  });
}

/**
 * Keeps the setup wizard's steps in browser history, so Back (button or trackpad swipe)
 * returns to the previous step instead of leaving the app — after a Google sign-in the
 * entry before the wizard is Google's consent screen.
 *
 * Each step after the first is pushed as its own entry at the same URL. On completion the
 * wizard's entries are rewound first, so Back from the inbox doesn't land on stale steps.
 */
export function useSetupWizardHistory<Step extends string>(steps: readonly Step[]) {
  const navigate = useNavigate();
  const location = useLocation();
  const [isCompleting, setIsCompleting] = useState(false);
  const firstStep = steps[0];
  const lastStep = steps[steps.length - 1];
  const stepInHistory = readStepFromState(location.state, steps);
  const currentStep = isCompleting ? lastStep : (stepInHistory ?? firstStep);

  const goToStep = useCallback(
    (step: Step) => {
      navigate(
        { pathname: location.pathname, search: location.search, hash: location.hash },
        { state: { [SETUP_STEP_STATE_KEY]: step } }
      );
    },
    [navigate, location.pathname, location.search, location.hash]
  );

  /** In-wizard Back buttons behave exactly like the browser's Back; the first step has none. */
  const goBack = useCallback(() => {
    if (stepInHistory) {
      navigate(STEP_BACK);
    }
  }, [navigate, stepInHistory]);

  /** Steps back over the wizard's pushed entries, keeping the last step on screen meanwhile. */
  const rewindWizardHistory = useCallback(async () => {
    setIsCompleting(true);
    const pushedEntries = stepInHistory ? steps.indexOf(stepInHistory) : 0;
    if (pushedEntries <= 0) {
      return;
    }
    const popped = waitForHistoryPop();
    navigate(-pushedEntries);
    await popped;
  }, [navigate, stepInHistory, steps]);

  return { currentStep, goToStep, goBack, rewindWizardHistory };
}
