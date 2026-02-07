import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { API_URL } from 'config/api';
import { useEmailDetailToneCheck } from 'hooks/useEmailDetailToneCheck';
import { useReplyDraftGeneration, ReplyGenerationDebugInfo } from 'hooks/useReplyDraftGeneration';
import { useNotifications } from 'contexts/NotificationContext';
import { useAuth } from 'contexts/AuthContext';
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
  const { user } = useAuth();
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
    debugInfo: replyGenerationDebugInfo,
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
      const normalizedUserEmail = user?.email?.toLowerCase();
      const isFromCurrentUser = normalizedUserEmail && email.from?.toLowerCase() === normalizedUserEmail;

      if (mode === REPLY_MODE_FORWARD) {
        setReplyRecipients('');
        setInitialAttachments(email.attachments || []);
      } else if (mode === REPLY_MODE_REPLY_ALL) {
        const recipients: string[] = [];
        if (isFromCurrentUser) {
          // User sent this email - reply to the original recipients, not to self
          if ((email as any).to) {
            const toRecipients = (email as any).to.split(',').map((r: string) => r.trim()).filter((r: string) => r && r.toLowerCase() !== normalizedUserEmail);
            recipients.push(...toRecipients);
          }
        } else {
          recipients.push(email.from);
          if ((email as any).to) {
            const toRecipients = (email as any).to.split(',').map((r: string) => r.trim()).filter((r: string) => r && r.toLowerCase() !== normalizedUserEmail);
            recipients.push(...toRecipients);
          }
        }
        setReplyRecipients([...new Set(recipients)].join(', '));
        setInitialAttachments([]);
      } else {
        // Regular reply
        if (isFromCurrentUser) {
          // User sent this email - reply to the first recipient, not to self
          if ((email as any).to) {
            const firstRecipient = (email as any).to.split(',').map((r: string) => r.trim()).filter((r: string) => r && r.toLowerCase() !== normalizedUserEmail)[0];
            setReplyRecipients(firstRecipient || email.from);
          } else {
            setReplyRecipients(email.from);
          }
        } else {
          setReplyRecipients(email.from);
        }
        setInitialAttachments([]);
      }
    }
    handleGenerateDraft();
  }, [email, user?.email, handleGenerateDraft, setDraft, setToneCheckResult]);

  const handleSendReply = useCallback(async (
    files: File[] = [],
    expectedReplyHours?: number,
    forwardAttachmentIds?: string[],
    onClose?: () => void,
  ) => {
    if (!emailId || !draft) return;
    
    const toneOk = await checkTone(draft);
    if (!toneOk) return;
    
    setSending(true);
    try {
      // Use FormData if we have files to send
      if (files.length > 0) {
        const formData = new FormData();
        formData.append('reply', draft);
        formData.append('recipients', replyRecipients);
        formData.append('replyAll', String(replyMode === REPLY_MODE_REPLY_ALL));
        if (replyCc) formData.append('cc', replyCc);
        if (replyBcc) formData.append('bcc', replyBcc);
        if (expectedReplyHours !== undefined) {
          formData.append('expectedReplyHours', String(expectedReplyHours));
        }
        if (forwardAttachmentIds && forwardAttachmentIds.length > 0) {
          formData.append('forwardAttachmentIds', JSON.stringify(forwardAttachmentIds));
        }
        files.forEach((file) => {
          formData.append('files', file);
        });

        await axios.post(`${API_URL}/replies/send/${emailId}`, formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });
      } else {
        await axios.post(`${API_URL}/replies/send/${emailId}`, { 
          reply: draft,
          recipients: replyRecipients,
          cc: replyCc || undefined,
          bcc: replyBcc || undefined,
          replyAll: replyMode === REPLY_MODE_REPLY_ALL,
          expectedReplyHours: expectedReplyHours || undefined,
          forwardAttachmentIds: forwardAttachmentIds && forwardAttachmentIds.length > 0 ? forwardAttachmentIds : undefined,
        });
      }
      setDraft(null);
      setShowReplyComposer(false);
      setReplyCc('');
      setReplyBcc('');
      setShowCc(false);
      setShowBcc(false);
      setInitialAttachments([]);
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
    replyGenerationDebugInfo,
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

