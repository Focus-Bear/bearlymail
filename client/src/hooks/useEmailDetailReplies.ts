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
  replyTo?: string;
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
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [scheduledSendAt, setScheduledSendAt] = useState<Date | null>(null);

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

      // Use Reply-To address if available, otherwise fall back to From address
      const replyToAddress = email.replyTo || email.from;

      if (mode === REPLY_MODE_FORWARD) {
        setReplyRecipients('');
        setInitialAttachments(email.attachments || []);
      } else if (mode === REPLY_MODE_REPLY_ALL) {
        const recipients: string[] = [];
        const extractEmail = (addr: string): string => {
          const match = addr.match(/<([^>]+)>/);
          return match ? match[1].toLowerCase() : addr.toLowerCase();
        };
        const isCurrentUser = (addr: string): boolean =>
          !!normalizedUserEmail && extractEmail(addr) === normalizedUserEmail;

        if (isFromCurrentUser) {
          // User sent this email - reply to the original recipients, not to self
          if ((email as any).to) {
            const toRecipients = (email as any).to.split(',').map((r: string) => r.trim()).filter((r: string) => r && !isCurrentUser(r));
            recipients.push(...toRecipients);
          }
        } else {
          recipients.push(replyToAddress);
          if ((email as any).to) {
            const toRecipients = (email as any).to.split(',').map((r: string) => r.trim()).filter((r: string) => r && !isCurrentUser(r));
            recipients.push(...toRecipients);
          }
        }
        setReplyRecipients([...new Set(recipients)].join(', '));

        // Add CC recipients from the original email
        if ((email as any).cc) {
          const ccRecipients = (email as any).cc.split(',').map((r: string) => r.trim()).filter((r: string) => r && !isCurrentUser(r));
          if (ccRecipients.length > 0) {
            setReplyCc(ccRecipients.join(', '));
            setShowCc(true);
          }
        }
        setInitialAttachments([]);
      } else {
        // Regular reply
        if (isFromCurrentUser) {
          // User sent this email - reply to the first recipient, not to self
          if ((email as any).to) {
            const extractEmail = (addr: string): string => {
              const match = addr.match(/<([^>]+)>/);
              return match ? match[1].toLowerCase() : addr.toLowerCase();
            };
            const firstRecipient = (email as any).to.split(',').map((r: string) => r.trim()).filter((r: string) => r && !!normalizedUserEmail && extractEmail(r) !== normalizedUserEmail)[0];
            setReplyRecipients(firstRecipient || replyToAddress);
          } else {
            setReplyRecipients(replyToAddress);
          }
        } else {
          setReplyRecipients(replyToAddress);
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
    draftOverride?: string,
    scheduledSendAtOverride?: Date,
  ) => {
    const draftToSend = draftOverride || draft;
    const scheduleTime = scheduledSendAtOverride || scheduledSendAt;
    if (!emailId || !draftToSend) return;

    if (!draftOverride) {
      const toneOk = await checkTone(draftToSend);
      if (!toneOk) return;
    }

    const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const currentReplyRecipients = replyRecipients;
    const currentReplyCc = replyCc;
    const currentReplyBcc = replyBcc;
    const currentReplyMode = replyMode;
    const currentShowCc = showCc;
    const currentShowBcc = showBcc;
    const currentInitialAttachments = initialAttachments;
    const isScheduled = !!scheduleTime;

    setShowReplyComposer(false);
    if (onClose) {
      onClose();
    }

    const sendReplyAsync = async () => {
      try {
        if (files.length > 0) {
          const formData = new FormData();
          formData.append('reply', draftToSend);
          formData.append('recipients', currentReplyRecipients);
          formData.append('replyAll', String(currentReplyMode === REPLY_MODE_REPLY_ALL));
          if (currentReplyCc) formData.append('cc', currentReplyCc);
          if (currentReplyBcc) formData.append('bcc', currentReplyBcc);
          if (expectedReplyHours !== undefined) {
            formData.append('expectedReplyHours', String(expectedReplyHours));
          }
          if (forwardAttachmentIds && forwardAttachmentIds.length > 0) {
            formData.append('forwardAttachmentIds', JSON.stringify(forwardAttachmentIds));
          }
          if (scheduleTime) {
            formData.append('scheduledSendAt', scheduleTime.toISOString());
            formData.append('userTimezone', userTimezone);
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
            reply: draftToSend,
            recipients: currentReplyRecipients,
            cc: currentReplyCc || undefined,
            bcc: currentReplyBcc || undefined,
            replyAll: currentReplyMode === REPLY_MODE_REPLY_ALL,
            expectedReplyHours: expectedReplyHours || undefined,
            forwardAttachmentIds: forwardAttachmentIds && forwardAttachmentIds.length > 0 ? forwardAttachmentIds : undefined,
            scheduledSendAt: scheduleTime?.toISOString(),
            userTimezone: scheduleTime ? userTimezone : undefined,
          });
        }
        setDraft(null);
        setReplyCc('');
        setReplyBcc('');
        setShowCc(false);
        setShowBcc(false);
        setInitialAttachments([]);
        setScheduledSendAt(null);
        showSuccess(isScheduled ? t('emailDetail.replyScheduledSuccess') : t('emailDetail.replySentSuccess'));
      } catch (error: any) {
        console.error('Error sending reply:', error);
        setDraft(draftToSend);
        setReplyRecipients(currentReplyRecipients);
        setReplyCc(currentReplyCc);
        setReplyBcc(currentReplyBcc);
        setShowCc(currentShowCc);
        setShowBcc(currentShowBcc);
        setInitialAttachments(currentInitialAttachments);
        setScheduledSendAt(scheduleTime);
        setShowReplyComposer(true);
        showError(error.response?.data?.message || t('emailDetail.replySentError'));
      }
    };

    sendReplyAsync();
  }, [emailId, draft, replyRecipients, replyCc, replyBcc, replyMode, showCc, showBcc, initialAttachments, scheduledSendAt, checkTone, setDraft, setReplyRecipients, setReplyCc, setReplyBcc, setShowCc, setShowBcc, setInitialAttachments, setScheduledSendAt, setShowReplyComposer, showSuccess, showError, t]);

  const handleOpenTimePicker = useCallback(() => {
    setShowTimePicker(true);
  }, []);

  const handleTimeSelect = useCallback((time: Date) => {
    setScheduledSendAt(time);
    setShowTimePicker(false);
  }, []);

  const handleCancelTimePicker = useCallback(() => {
    setShowTimePicker(false);
  }, []);

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
    showTimePicker,
    scheduledSendAt,
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
    handleOpenTimePicker,
    handleTimeSelect,
    handleCancelTimePicker,
    disputeToneCheck,
    clearDisputeResult,
  };
}

