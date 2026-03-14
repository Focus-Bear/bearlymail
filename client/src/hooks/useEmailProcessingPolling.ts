import { useEffect } from 'react';
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
  useEffect(() => {
    const processingEmails = emails.filter(event => event.isProcessingPriority || event.isProcessingSummary);

    if (processingEmails.length === 0) {
      return;
    }

    const interval = setInterval(() => {
      const stillProcessing = emails.some(event => event.isProcessingPriority || event.isProcessingSummary);
      if (stillProcessing) {
        onPoll();
      }
    }, LONG_TIMEOUT_MS);

    return () => clearInterval(interval);
  }, [emails.filter(event => event.isProcessingPriority || event.isProcessingSummary).length]);
}
