import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
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
 * Handles inbox URL synchronization (initial mount redirect + URL→state sync on browser navigation).
 *
 * ## Fix for #1191 — navigate loop
 *
 * Effect 2 (state→URL sync via navigate) has been DELETED. The old design was:
 *
 *   state changes → Effect 2 → navigate() → URL changes → Effect 3 → state changes → Effect 2 → ...
 *
 * This caused Chrome to throttle navigation at 1000+ calls per load.
 *
 * Navigation now happens ONLY from event handlers (setMode, openEmail, closeEmail in
 * useInboxState). Reactive effects in this hook are strictly one-way: URL → state.
 * There is no path from state back to navigate(), so the cycle cannot form.
 *
 * Removed along with Effect 2:
 *   - navigateRef (was only needed to stabilise Effect 2's dep array)
 *   - lastUrlRef (was only needed to deduplicate Effect 2's navigate() calls)
 *   - useLocation import (was only needed to initialise lastUrlRef)
 */
// Fix #1296: Only treat a URL segment as an email ID if it looks like a UUID.
// Gmail thread IDs are 16-char hex strings without dashes. If the URL contains
// a Gmail thread ID (e.g. from an old link), do not attempt to open it as an
// email — it would produce a 500 from the API.
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isEmailUuid(value: string | undefined): value is string {
  return value !== undefined && UUID_REGEX.test(value);
}

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

  // Effect 1 — mount only: restore split view email from URL; redirect if mode is absent from URL.
  // The isInitialMount ref guard ensures the body runs exactly once; listing all reactive deps
  // satisfies the exhaustive-deps rule without causing the effect to trigger on subsequent renders
  // (the guard returns early after the first execution).
  useEffect(() => {
    if (!isInitialMount.current) {
      return;
    }
    isInitialMount.current = false;
    if (urlThreadId && splitViewSelectedEmailId !== urlThreadId) {
      if (isEmailUuid(urlThreadId)) {
        openEmail(urlThreadId);
      } else {
        // urlThreadId is not a UUID (e.g. a Gmail hex thread ID from an old link) — ignore it
        // to prevent a 500 from the API (#1296).
        console.warn('[useInboxUrlSync] urlThreadId does not look like a UUID, ignoring:', urlThreadId);
      }
    }
    if (!urlMode) {
      navigate(`${basePath}/${mode}`, { replace: true });
    }
  }, [urlThreadId, splitViewSelectedEmailId, urlMode, openEmail, navigate, basePath, mode]);

  // Stable ref for the URL-params-changed callback. Effect 3 re-runs only when
  // urlMode/urlThreadId change, but the callback always reads fresh state via closure.
  // (Same pattern as the pre-existing onUrlParamsChangedRef — stable alternative to
  // useEffectEvent which does not exist in React 19.2 stable.)
  const onUrlParamsChangedRef = useRef<() => void>(() => {});
  onUrlParamsChangedRef.current = () => {
    if (isInitialMount.current) {
      return;
    }
    if (urlMode && isValidMode(urlMode) && urlMode !== mode) {
      onUrlModeChange(urlMode);
    }
    if (urlThreadId && urlThreadId !== splitViewSelectedEmailId) {
      if (isEmailUuid(urlThreadId)) {
        openEmail(urlThreadId);
      } else {
        // urlThreadId is not a UUID (e.g. a Gmail hex thread ID from an old link) — ignore it
        // to prevent a 500 from the API (#1296).
        console.warn('[useInboxUrlSync] urlThreadId does not look like a UUID, ignoring:', urlThreadId);
      }
    } else if (!urlThreadId && splitViewSelectedEmailId) {
      closeEmail();
    }
  };

  // Effect 3 — URL → state sync on browser back/forward navigation.
  // This effect is strictly ONE-WAY: it reads URL params and updates React state.
  // It does NOT call navigate(), so it cannot chain back into itself. Loop is broken.
  useEffect(() => {
    onUrlParamsChangedRef.current();
  }, [urlMode, urlThreadId]);
}
