import { useEffect } from 'react';
import { LONG_TIMEOUT_MS } from 'constants/numbers';
import { Email } from 'types/email';

interface UseEmailProcessingPollingProps {
  emails: Email[];
  /**
   * Called on each poll tick. Must NOT wipe existing email state — use
   * refreshInPlace() rather than fetchEmails() so there is no visible reload.
   */
  onPoll: () => Promise<void>;
}

export function useEmailProcessingPolling({
  emails,
  onPoll,
}: UseEmailProcessingPollingProps) {
  useEffect(() => {
    const processingEmails = emails.filter(e => e.isProcessingPriority || e.isProcessingSummary);

    if (processingEmails.length === 0) {
      return;
    }

    const interval = setInterval(() => {
      const stillProcessing = emails.some(e => e.isProcessingPriority || e.isProcessingSummary);
      if (stillProcessing) {
        onPoll();
      }
    }, LONG_TIMEOUT_MS);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emails.filter(e => e.isProcessingPriority || e.isProcessingSummary).length]);
}







