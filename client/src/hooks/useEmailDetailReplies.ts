import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { API_URL } from 'config/api';
import { useEmailDetailToneCheck } from 'hooks/useEmailDetailToneCheck';
import { useReplyDraftGeneration } from 'hooks/useReplyDraftGeneration';
import { useNotifications } from 'contexts/NotificationContext';
import { REPLY_MODE_REPLY_ALL, REPLY_MODE_FORWARD } from 'constants/strings';

interface EmailAttachment {
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
}

interface Email {
  id: string;
  from: string;
  fromName?: string;
  subject: string;
  body: string;
  attachments?: EmailAttachment[];
}

interface UseEmailDetailRepliesOptions {
  autoGenerateReplies?: boolean;
}

export function useEmailDetailReplies(
  emailId: string,
  email: Email | null,
  options: UseEmailDetailRepliesOptions = {},
) {
  const { autoGenerateReplies = false } = options;
  const { t } = useTranslation();
  const { showSuccess, showError } = useNotifications();
  const [showReplyComposer, setShowReplyComposer] = useState(false);
  const [replyMode, setReplyMode] = useState<'reply' | 'replyAll' | 'forward'>('reply');
  const [replyRecipients, setReplyRecipients] = useState<string>('');
  const [replyCc, setReplyCc] = useState<string>('');
  const [replyBcc, setReplyBcc] = useState<string>('');
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [sending, setSending] = useState(false);
  const [initialAttachments, setInitialAttachments] = useState<EmailAttachment[]>([]);
  
  const {
    checkingTone,
    toneCheckResult,
    setToneCheckResult,
    checkTone,
    disputing,
    disputeResult,
    disputeToneCheck,
    clearDisputeResult,
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
  } = useReplyDraftGeneration(emailId, email, { autoGenerate: autoGenerateReplies });

  const handleOpenReplyComposer = useCallback((mode: 'reply' | 'replyAll' | 'forward') => {
    setReplyMode(mode);
    setShowReplyComposer(true);
    setDraft('');
    setToneCheckResult(null);
    setReplyCc('');
    setReplyBcc('');
    setShowCc(false);
    setShowBcc(false);
    if (email) {
      if (mode === REPLY_MODE_FORWARD) {
        setReplyRecipients('');
        setInitialAttachments(email.attachments || []);
      } else if (mode === REPLY_MODE_REPLY_ALL) {
        const recipients = [email.from];
        setReplyRecipients(recipients.join(', '));
        setInitialAttachments([]);
      } else {
        setReplyRecipients(email.from);
        setInitialAttachments([]);
      }
    }
    handleGenerateDraft();
  }, [email, handleGenerateDraft, setDraft, setToneCheckResult]);

  const handleSendReply = useCallback(async (onClose?: () => void, expectedReplyHours?: number) => {
    if (!emailId || !draft) return;
    
    const toneOk = await checkTone(draft);
    if (!toneOk) return;
    
    setSending(true);
    try {
      await axios.post(`${API_URL}/replies/send/${emailId}`, { 
        reply: draft,
        recipients: replyRecipients,
        cc: replyCc || undefined,
        bcc: replyBcc || undefined,
        replyAll: replyMode === REPLY_MODE_REPLY_ALL,
        expectedReplyHours: expectedReplyHours || undefined,
      });
      setDraft(null);
      setShowReplyComposer(false);
      setReplyCc('');
      setReplyBcc('');
      setShowCc(false);
      setShowBcc(false);
      showSuccess(t('emailDetail.replySentSuccess'));
      if (onClose) {
        onClose();
      }
    } catch (error: any) {
      console.error('Error sending reply:', error);
      showError(error.response?.data?.message || t('emailDetail.replySentError'));
    } finally {
      setSending(false);
    }
  }, [emailId, draft, replyRecipients, replyCc, replyBcc, replyMode, checkTone, setDraft, showSuccess, showError, t]);

  return {
    replyOptions,
    selectedReplyOption,
    showReplyComposer,
    replyMode,
    replyRecipients,
    replyCc,
    replyBcc,
    showCc,
    showBcc,
    draft,
    loadingReplies,
    sending,
    checkingTone,
    toneCheckResult,
    disputing,
    disputeResult,
    initialAttachments,
    setReplyRecipients,
    setReplyCc,
    setReplyBcc,
    setShowCc,
    setShowBcc,
    setDraft,
    setSelectedReplyOption,
    setShowReplyComposer,
    setReplyOptions,
    setToneCheckResult,
    handleOpenReplyComposer,
    handleSendReply,
    disputeToneCheck,
    clearDisputeResult,
  };
}

