import { useState, useCallback } from 'react';
import axios from 'axios';
import { API_URL } from 'config/api';
import { useEmailDetailToneCheck } from 'hooks/useEmailDetailToneCheck';
import { useReplyDraftGeneration } from 'hooks/useReplyDraftGeneration';
import { REPLY_MODE_REPLY_ALL } from 'constants/strings';

interface Email {
  id: string;
  from: string;
  fromName?: string;
  subject: string;
  body: string;
}

export function useEmailDetailReplies(emailId: string, email: Email | null) {
  const [showReplyComposer, setShowReplyComposer] = useState(false);
  const [replyMode, setReplyMode] = useState<'reply' | 'replyAll'>('reply');
  const [replyRecipients, setReplyRecipients] = useState<string>('');
  const [sending, setSending] = useState(false);
  
  const {
    checkingTone,
    toneCheckResult,
    setToneCheckResult,
    checkTone,
  } = useEmailDetailToneCheck();

  const {
    replyOptions,
    selectedReplyOption,
    draft,
    loadingReplies,
    setReplyOptions,
    setDraft,
    setSelectedReplyOption,
    handleGenerateDraft,
  } = useReplyDraftGeneration(emailId, email);

  const handleOpenReplyComposer = useCallback((mode: 'reply' | 'replyAll') => {
    setReplyMode(mode);
    setShowReplyComposer(true);
    setDraft('');
    setToneCheckResult(null);
    if (email) {
      if (mode === REPLY_MODE_REPLY_ALL) {
        const recipients = [email.from];
        setReplyRecipients(recipients.join(', '));
      } else {
        setReplyRecipients(email.from);
      }
    }
    handleGenerateDraft();
  }, [email, handleGenerateDraft, setDraft, setToneCheckResult]);

  const handleSendReply = useCallback(async (onClose?: () => void) => {
    if (!emailId || !draft) return;
    
    const toneOk = await checkTone(draft);
    if (!toneOk) return;
    
    setSending(true);
    try {
      await axios.post(`${API_URL}/replies/send/${emailId}`, { 
        reply: draft,
        recipients: replyRecipients,
        replyAll: replyMode === REPLY_MODE_REPLY_ALL,
      });
      setDraft(null);
      setShowReplyComposer(false);
      if (onClose) {
        onClose();
      }
    } catch (error: any) {
      console.error('Error sending reply:', error);
    } finally {
      setSending(false);
    }
  }, [emailId, draft, replyRecipients, replyMode, checkTone, setDraft]);

  return {
    replyOptions,
    selectedReplyOption,
    showReplyComposer,
    replyMode,
    replyRecipients,
    draft,
    loadingReplies,
    sending,
    checkingTone,
    toneCheckResult,
    setReplyRecipients,
    setDraft,
    setSelectedReplyOption,
    setShowReplyComposer,
    setReplyOptions,
    setToneCheckResult,
    handleOpenReplyComposer,
    handleSendReply,
  };
}

