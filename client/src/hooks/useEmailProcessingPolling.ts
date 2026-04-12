import { useEffect, useRef } from 'react';
import { Email } from 'types/email';
import { devLog } from 'utils/dev-logger';

import { LONG_TIMEOUT_MS } from 'constants/numbers';

interface UseEmailProcessingPollingProps {
  emails: Email[];
  /**
   * Called on each poll tick. Must NOT wipe existing email state — use
   * refreshInPlace() rather than fetchEmails() so there is no visible reload.
   */
  onPoll: () => Promise<void>;
}

export function useEmailProcessingPolling({ emails, onPoll }: UseEmailProcessingPollingProps) {
  // Ref keeps the latest emails available inside the interval without making emails
  // a reactive dependency (which would restart the interval on every fetch).
  const emailsRef = useRef(emails);
  emailsRef.current = emails;

  // Ref-based callback pattern: captures the latest onPoll without making it a dep.
  // Prevents stale closure where interval calls an outdated refreshInPlace.
  // (useEffectEvent does not exist in React 19.2 stable; this is the stable equivalent.)
  const stableOnPollRef = useRef<() => void>(() => {});
  stableOnPollRef.current = () => onPoll();

  const processingCount = emails.filter(event => event.isProcessingPriority || event.isProcessingSummary).length;

  useEffect(() => {
    if (processingCount === 0) {
      return;
    }

    const interval = setInterval(() => {
      // Always read from ref to get current emails — avoids stale closure capture
      const stillProcessing = emailsRef.current.some(event => event.isProcessingPriority || event.isProcessingSummary);
      devLog('[ProcessingPoll] tick — stillProcessing:', stillProcessing);
      if (stillProcessing) {
        stableOnPollRef.current();
      }
    }, LONG_TIMEOUT_MS);

    return () => clearInterval(interval);
  }, [processingCount, stableOnPollRef]); // stableOnPollRef is a ref object (stable across renders)
}
