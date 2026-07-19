import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const ANCHOR_TARGET_BLANK = '_blank';

/**
 * Guards against losing unsaved changes when leaving the current page.
 *
 * The app uses a plain BrowserRouter (no data router), so React Router's
 * useBlocker is unavailable. Instead this registers a beforeunload handler
 * (reload / tab close / external links) and intercepts in-app link clicks in
 * the capture phase so the caller can show a styled confirm dialog.
 *
 * While `isDirty` is true, clicking an internal link sets `pendingPath`
 * instead of navigating; call `confirmNavigation` to proceed to that path or
 * `cancelNavigation` to stay on the page.
 */
export function useUnsavedChangesGuard(isDirty: boolean) {
  const navigate = useNavigate();
  const [pendingPath, setPendingPath] = useState<string | null>(null);

  useEffect(() => {
    if (!isDirty) {
      return;
    }
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    if (!isDirty) {
      return;
    }
    const handleClickCapture = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) {
        return;
      }
      const anchor = (event.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!anchor || anchor.getAttribute('target') === ANCHOR_TARGET_BLANK) {
        return;
      }
      const href = anchor.getAttribute('href');
      if (!href) {
        return;
      }
      // Resolve relative to the full current URL so hash/query-only links
      // (e.g. "#email-batching") keep the current pathname and are not blocked.
      const url = new URL(href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      setPendingPath(url.pathname + url.search + url.hash);
    };
    document.addEventListener('click', handleClickCapture, true);
    return () => document.removeEventListener('click', handleClickCapture, true);
  }, [isDirty]);

  const confirmNavigation = useCallback(() => {
    if (pendingPath) {
      navigate(pendingPath);
    }
    setPendingPath(null);
  }, [pendingPath, navigate]);

  const cancelNavigation = useCallback(() => setPendingPath(null), []);

  return { pendingPath, confirmNavigation, cancelNavigation };
}
