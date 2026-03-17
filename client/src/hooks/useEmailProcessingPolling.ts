import { useEffect, useEffectEvent, useRef } from 'react';
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

  // useEffectEvent: captures the latest onPoll without making it a dep.
  // Prevents stale closure where interval calls an outdated refreshInPlace.
  const stableOnPoll = useEffectEvent(() => onPoll());

  const processingCount = emails.filter(
    event => event.isProcessingPriority || event.isProcessingSummary
  ).length;

  useEffect(() => {
    if (processingCount === 0) {
      return;
    }

    const interval = setInterval(() => {
      // Always read from ref to get current emails — avoids stale closure capture
      const stillProcessing = emailsRef.current.some(
        event => event.isProcessingPriority || event.isProcessingSummary
      );
      devLog('[ProcessingPoll] tick — stillProcessing:', stillProcessing);
      if (stillProcessing) {
        stableOnPoll();
      }
    }, LONG_TIMEOUT_MS);

    return () => clearInterval(interval);
  }, [processingCount]); // eslint-disable-line react-hooks/exhaustive-deps -- onPollRef.current is stable via ref pattern
}
