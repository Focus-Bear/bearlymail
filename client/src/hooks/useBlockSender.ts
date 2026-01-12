import { useCallback } from 'react';
import axios from 'axios';
import { SetStateAction } from 'react';
import { Email } from 'types/email';
import { API_URL } from 'config/api';
import { captureEvent } from 'utils/posthog';

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
    if (!blockConfirmEmail) return;
    
    const emailToBlock = blockConfirmEmail;
    captureEvent('sender_blocked', { email_id: emailToBlock.id });
    onHideBlockConfirm();
    
    // Optimistic update - remove from UI
    setEmails(prevEmails => prevEmails.filter(email => email.id !== emailToBlock.id));
    
    try {
      await axios.post(`${API_URL}/emails/${emailToBlock.id}/block-sender`);
      fetchEmails().catch(err => console.error('Error refreshing after block:', err));
    } catch (error) {
      console.error('Error blocking sender:', error);
      // Revert on error
      setEmails(prevEmails => [...prevEmails, emailToBlock].sort((a, b) => 
        new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
      ));
    }
  }, [blockConfirmEmail, onHideBlockConfirm, setEmails, fetchEmails]);

  return { confirmBlockSender };
}





