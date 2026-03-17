import { useEffect, useRef } from 'react';
import { Email } from 'types/email';

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
  const onPollRef = useRef(onPoll);
  onPollRef.current = onPoll;

  const processingCount = emails.filter(event => event.isProcessingPriority || event.isProcessingSummary).length;

  useEffect(() => {
    if (processingCount === 0) {
      return;
    }

    const interval = setInterval(() => {
      const stillProcessing = emails.some(event => event.isProcessingPriority || event.isProcessingSummary);
      if (stillProcessing) {
        onPollRef.current();
      }
    }, LONG_TIMEOUT_MS);

    return () => clearInterval(interval);
  }, [processingCount]); // eslint-disable-line react-hooks/exhaustive-deps -- onPollRef.current is stable via ref pattern
}
