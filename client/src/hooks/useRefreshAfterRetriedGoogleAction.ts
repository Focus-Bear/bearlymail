import { useEffect } from 'react';
import { GOOGLE_PERMISSION_ACTION_RETRIED_EVENT } from 'utils/googlePermissionRequired';

/**
 * An archive, snooze or star retried after a Google grant runs after the page
 * reloaded from Google's consent screen, so the view already shows the old
 * state; refresh it once the retry lands.
 */
export function useRefreshAfterRetriedGoogleAction(refresh: () => Promise<void>): void {
  useEffect(() => {
    const refreshAfterRetriedAction = () => {
      void refresh();
    };
    window.addEventListener(GOOGLE_PERMISSION_ACTION_RETRIED_EVENT, refreshAfterRetriedAction);
    return () => window.removeEventListener(GOOGLE_PERMISSION_ACTION_RETRIED_EVENT, refreshAfterRetriedAction);
  }, [refresh]);
}
