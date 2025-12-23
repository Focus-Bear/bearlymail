import { useEffect } from 'react';
import { Email } from '../types/email';

interface UseEmailProcessingPollingProps {
  emails: Email[];
  fetchEmails: () => Promise<void>;
}

export function useEmailProcessingPolling({
  emails,
  fetchEmails,
}: UseEmailProcessingPollingProps) {
  useEffect(() => {
    const processingEmails = emails.filter(e => e.isProcessingPriority || e.isProcessingSummary);
    
    if (processingEmails.length === 0) {
      return;
    }

    const interval = setInterval(() => {
      const stillProcessing = emails.some(e => e.isProcessingPriority || e.isProcessingSummary);
      if (stillProcessing) {
        console.log(`[Polling] ${processingEmails.length} emails still processing, refreshing...`);
        fetchEmails();
      }
    }, 10000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emails.filter(e => e.isProcessingPriority || e.isProcessingSummary).length]);
}



