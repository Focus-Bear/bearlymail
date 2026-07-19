import { useCallback } from 'react';
import { SetStateAction } from 'react';
import axios from 'axios';
import { Email, getEmailPriorityScore } from 'types/email';
import { captureEvent } from 'utils/posthog';

import { API_URL } from 'config/api';
import { ANALYTICS_EVENTS } from 'constants/analytics-events';

// Threshold for considering priority scores "equal" (matches backend RATIOS.TINY)
const PRIORITY_SCORE_TINY_THRESHOLD = 0.01;

interface UseBlockSenderProps {
  emails: Email[];
  setEmails: React.Dispatch<SetStateAction<Email[]>>;
  blockConfirmEmail: Email | null;
  onHideBlockConfirm: () => void;
  fetchEmails: () => Promise<void>;
}

export function useBlockSender({
  emails,
  setEmails,
  blockConfirmEmail,
  onHideBlockConfirm,
  fetchEmails,
}: UseBlockSenderProps) {
  const confirmBlockSender = useCallback(async () => {
    if (!blockConfirmEmail) {
      return;
    }

    const emailToBlock = blockConfirmEmail;
    captureEvent(ANALYTICS_EVENTS.SENDER_BLOCKED, { email_id: emailToBlock.id });
    onHideBlockConfirm();

    // Optimistic update - remove from UI
    setEmails(prevEmails => prevEmails.filter(email => email.id !== emailToBlock.id));

    try {
      await axios.post(`${API_URL}/emails/${emailToBlock.id}/block-sender`);
      fetchEmails().catch(err => console.error('Error refreshing after block:', err));
    } catch (error) {
      console.error('Error blocking sender:', error);
      // Revert on error with consistent sorting: priority DESC, threadUpdatedAt DESC, threadId (stable)
      setEmails(prevEmails =>
        [...prevEmails, emailToBlock].sort((itemA, itemB) => {
          // Primary: priority score DESC
          const aScore = getEmailPriorityScore(itemA);
          const bScore = getEmailPriorityScore(itemB);
          if (Math.abs(bScore - aScore) > PRIORITY_SCORE_TINY_THRESHOLD) {
            return bScore - aScore;
          }
          // Secondary: threadUpdatedAt DESC
          const aUpdatedAt = itemA.threadUpdatedAt ? new Date(itemA.threadUpdatedAt).getTime() : 0;
          const bUpdatedAt = itemB.threadUpdatedAt ? new Date(itemB.threadUpdatedAt).getTime() : 0;
          if (bUpdatedAt !== aUpdatedAt) {
            return bUpdatedAt - aUpdatedAt;
          }
          // Final stable tiebreaker: threadId
          return itemA.threadId.localeCompare(itemB.threadId);
        })
      );
    }
  }, [blockConfirmEmail, onHideBlockConfirm, setEmails, fetchEmails]);

  return { confirmBlockSender };
}
