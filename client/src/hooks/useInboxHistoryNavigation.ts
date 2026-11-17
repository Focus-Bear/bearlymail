import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { InboxMode } from 'types/email';

/** History-entry state marking a thread that was opened on top of the list entry behind it. */
export const THREAD_OPENED_OVER_LIST_STATE_KEY = 'bearlymailThreadOpenedOverList';

const STEP_BACK = -1;

function wasThreadOpenedOverList(state: unknown): boolean {
  return typeof state === 'object' && state !== null && THREAD_OPENED_OVER_LIST_STATE_KEY in state;
}

interface SplitViewNavigationTarget {
  selectedEmailId: string | null;
  openEmail: (emailId: string) => void;
  closeEmail: () => void;
}

interface UseInboxHistoryNavigationParams {
  basePath: string;
  mode: InboxMode;
  splitView: SplitViewNavigationTarget;
}

/**
 * Turns inbox navigation into real browser history so Back (button, trackpad swipe) moves
 * through the app instead of leaving it. Previously every tab switch and thread open
 * replaced the current entry, so the whole session was one entry and Back went straight
 * to whatever preceded the app — after sign-in, the provider's OAuth consent screen.
 *
 * - Switching tab pushes an entry.
 * - Opening a thread from the list pushes an entry; moving to another thread while one is
 *   open (next/previous, auto-advance after archive) replaces it, so Back returns to the list
 *   rather than replaying every email the user stepped through.
 * - Closing a thread that was pushed steps back to the list entry instead of adding a
 *   duplicate list entry that Back would have to walk through.
 */
export function useInboxHistoryNavigation({ basePath, mode, splitView }: UseInboxHistoryNavigationParams) {
  const navigate = useNavigate();
  const location = useLocation();
  const isThreadOverList = wasThreadOpenedOverList(location.state);

  const navigateToMode = useCallback(
    (newMode: InboxMode) => {
      navigate(`${basePath}/${newMode}`);
    },
    [navigate, basePath]
  );

  const openEmailWithNavigate = useCallback(
    (emailId: string) => {
      const isSwitchingThread = Boolean(splitView.selectedEmailId);
      splitView.openEmail(emailId);
      const threadPath = `${basePath}/${mode}/${emailId}`;
      if (isSwitchingThread) {
        navigate(threadPath, { replace: true, state: location.state });
        return;
      }
      navigate(threadPath, { state: { [THREAD_OPENED_OVER_LIST_STATE_KEY]: true } });
    },
    [splitView, navigate, basePath, mode, location.state]
  );

  const closeEmailWithNavigate = useCallback(() => {
    splitView.closeEmail();
    if (isThreadOverList) {
      navigate(STEP_BACK);
      return;
    }
    navigate(`${basePath}/${mode}`, { replace: true });
  }, [splitView, navigate, basePath, mode, isThreadOverList]);

  return { navigateToMode, openEmailWithNavigate, closeEmailWithNavigate };
}
