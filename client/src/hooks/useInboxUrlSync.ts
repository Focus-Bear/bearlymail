import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { InboxMode } from 'types/email';

import { MODE_ACTION, MODE_BLOCKED, MODE_FOLLOW_UP, MODE_TRIAGE } from 'constants/strings';

const VALID_MODES: InboxMode[] = [MODE_TRIAGE, MODE_ACTION, MODE_FOLLOW_UP, MODE_BLOCKED];

function isValidMode(value: string | undefined): value is InboxMode {
  return value !== undefined && VALID_MODES.includes(value as InboxMode);
}

interface UrlSyncParams {
  isFocusedMode: boolean;
  mode: InboxMode;
  splitViewSelectedEmailId: string | null | undefined;
  urlMode: string | undefined;
  urlThreadId: string | undefined;
  openEmail: (id: string) => void;
  closeEmail: () => void;
  navigate: ReturnType<typeof useNavigate>;
  onUrlModeChange: (mode: InboxMode) => void;
}

/**
 * Handles inbox URL synchronization (initial mount redirect + ongoing URL updates + URL→mode sync).
 * Extracted from useInboxState to reduce its statement count.
 */
export function useInboxUrlSync({
  isFocusedMode,
  mode,
  splitViewSelectedEmailId,
  urlMode,
  urlThreadId,
  openEmail,
  closeEmail,
  navigate,
  onUrlModeChange,
}: UrlSyncParams) {
  const basePath = isFocusedMode ? '/focused-inbox' : '/inbox';
  const isInitialMount = useRef(true);
  const { pathname } = useLocation();
  const lastUrlRef = useRef<string>(pathname);
  // Wrap navigate in a ref so Effect 2 always uses the latest navigate function without
  // including it in the dep array (same pattern as Effect 3 fix in #1177).
  const navigateRef = useRef<ReturnType<typeof useNavigate>>(navigate);
  navigateRef.current = navigate;

  // Initial mount: restore split view email from URL and set mode if missing from URL.
  useEffect(() => {
    if (!isInitialMount.current) {
      return;
    }
    isInitialMount.current = false;
    if (urlThreadId && splitViewSelectedEmailId !== urlThreadId) {
      openEmail(urlThreadId);
    }
    if (!urlMode) {
      const initialPath = `${basePath}/${mode}`;
      // Update lastUrlRef BEFORE navigating so Effect 2 (mode/splitView sync) doesn't
      // see a stale lastUrlRef and trigger a redundant second replaceState on the same path.
      lastUrlRef.current = initialPath;
      navigate(initialPath, { replace: true });
    }
  }, []);

  // Sync URL path when mode or split view email changes.
  // navigate is read from the ref so it is NOT listed in deps — adding it caused a loop:
  // navigate identity changes during react-router internal transitions → Effect re-fires →
  // replaceState fires → URL-change event → fetchEmails increments fetchSessionRef → in-flight
  // category fetch abandoned → Other accordion shows 0 (issue #1182 / race from #1183).
  useEffect(() => {
    if (isInitialMount.current) {
      return;
    }
    const newPath = splitViewSelectedEmailId
      ? `${basePath}/${mode}/${splitViewSelectedEmailId}`
      : `${basePath}/${mode}`;
    if (newPath !== lastUrlRef.current) {
      lastUrlRef.current = newPath;
      navigateRef.current(newPath, { replace: true });
    }
  }, [mode, splitViewSelectedEmailId, basePath]);

  // Use a ref-based callback pattern (stable alternative to useEffectEvent which does not exist
  // in React 19.2 stable) so Effect 3 re-runs only when urlMode/urlThreadId change, but the
  // callback always reads fresh splitViewSelectedEmailId via closure (ref is reassigned each render).
  const onUrlParamsChangedRef = useRef<() => void>(() => {});
  onUrlParamsChangedRef.current = () => {
    if (isInitialMount.current) {
      return;
    }
    if (urlMode && isValidMode(urlMode) && urlMode !== mode) {
      onUrlModeChange(urlMode);
    }
    if (urlThreadId && urlThreadId !== splitViewSelectedEmailId) {
      openEmail(urlThreadId);
    } else if (!urlThreadId && splitViewSelectedEmailId) {
      closeEmail();
    }
  };

  // Sync mode/split view from URL params when they change (browser back/forward).
  useEffect(() => {
    onUrlParamsChangedRef.current();
  }, [urlMode, urlThreadId]);
}
