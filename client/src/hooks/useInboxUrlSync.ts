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
      navigate(`${basePath}/${mode}`, { replace: true });
    }
  }, []);

  // Sync URL path when mode or split view email changes.
  useEffect(() => {
    if (isInitialMount.current) {
      return;
    }
    const newPath = splitViewSelectedEmailId
      ? `${basePath}/${mode}/${splitViewSelectedEmailId}`
      : `${basePath}/${mode}`;
    if (newPath !== lastUrlRef.current) {
      lastUrlRef.current = newPath;
      navigate(newPath, { replace: true });
    }
  }, [mode, splitViewSelectedEmailId, navigate, basePath]);

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
