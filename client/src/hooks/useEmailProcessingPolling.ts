import { useEffect, useMemo, useRef } from 'react';
import { useSelector } from 'react-redux';
import { Email } from 'types/email';
import { devLog } from 'utils/dev-logger';

import { LONG_TIMEOUT_MS } from 'constants/numbers';
import { CATEGORY_OTHER } from 'constants/strings';
import { getCategoryKey } from 'hooks/useEmailFetching';
import { selectExpandedCategoryKeys } from 'store/slices/categorySlice';

interface UseEmailProcessingPollingProps {
  emails: Email[];
  /**
   * Called on each poll tick. Must NOT wipe existing email state — use
   * refreshInPlace() rather than fetchEmails() so there is no visible reload.
   */
  onPoll: () => Promise<void>;
}

function isProcessing(email: Email): boolean {
  return Boolean(email.isProcessingPriority || email.isProcessingSummary);
}

/**
 * Whether any email the user can currently see (one in an open category accordion) is still
 * being processed. Rows in collapsed categories are invisible and are not refreshed by the
 * poll, so they must not keep it alive.
 */
export function hasVisibleProcessingEmail(emails: Email[], expandedKeys: Set<string>): boolean {
  return emails.some(
    email => isProcessing(email) && expandedKeys.has(getCategoryKey(email.category_id, email.category ?? CATEGORY_OTHER))
  );
}

export function useEmailProcessingPolling({ emails, onPoll }: UseEmailProcessingPollingProps) {
  const expandedKeyList = useSelector(selectExpandedCategoryKeys);
  const expandedKeys = useMemo(() => new Set(expandedKeyList), [expandedKeyList]);

  // Ref keeps the latest visibility check available inside the interval without making
  // emails a reactive dependency (which would restart the interval on every fetch).
  const isStillProcessingRef = useRef<() => boolean>(() => false);
  isStillProcessingRef.current = () => hasVisibleProcessingEmail(emails, expandedKeys);

  // Ref-based callback pattern: captures the latest onPoll without making it a dep.
  // Prevents stale closure where interval calls an outdated refreshInPlace.
  // (useEffectEvent does not exist in React 19.2 stable; this is the stable equivalent.)
  const stableOnPollRef = useRef<() => void>(() => {});
  stableOnPollRef.current = () => onPoll();

  const isPollingNeeded = hasVisibleProcessingEmail(emails, expandedKeys);

  useEffect(() => {
    if (!isPollingNeeded) {
      return;
    }

    const interval = setInterval(() => {
      const stillProcessing = isStillProcessingRef.current();
      devLog('[ProcessingPoll] tick — stillProcessing:', stillProcessing);
      if (stillProcessing) {
        stableOnPollRef.current();
      }
    }, LONG_TIMEOUT_MS);

    return () => clearInterval(interval);
  }, [isPollingNeeded]);
}
