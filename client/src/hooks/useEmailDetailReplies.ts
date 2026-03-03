import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { API_URL } from 'config/api';
import { useEmailDetailToneCheck } from 'hooks/useEmailDetailToneCheck';
import { useReplyDraftGeneration } from 'hooks/useReplyDraftGeneration';
import { useNotifications } from 'contexts/NotificationContext';
import { useAuth } from 'contexts/AuthContext';
import { REPLY_MODE_REPLY_ALL, REPLY_MODE_FORWARD } from 'constants/strings';

// Pure helper: builds recipient/cc addresses based on reply mode.
function buildReplyAddresses(
  mode: string,
  email: any,
  userEmail: string | undefined,
): { recipients: string; cc: string | null; showCc: boolean } {
  const normalizedUserEmail = userEmail?.toLowerCase();
  const extractEmail = (addr: string) => { const m = addr.match(/<([^>]+)>/); return m ? m[1].toLowerCase() : addr.toLowerCase(); };
  const notCurrentUser = (addr: string) => !!normalizedUserEmail && extractEmail(addr) !== normalizedUserEmail;
  const isFromCurrentUser = !!normalizedUserEmail && email.from?.toLowerCase() === normalizedUserEmail;
  const replyToAddress = email.replyTo || email.from;

  if (mode === REPLY_MODE_FORWARD) {
    return { recipients: '', cc: null, showCc: false };
  }

  if (mode === REPLY_MODE_REPLY_ALL) {
    const recipients: string[] = [];
    if (isFromCurrentUser) {
      if (email.to) { recipients.push(...email.to.split(',').map((r: string) => r.trim()).filter(notCurrentUser)); }
    } else {
      recipients.push(replyToAddress);
      if (email.to) { recipients.push(...email.to.split(',').map((r: string) => r.trim()).filter(notCurrentUser)); }
    }
    let cc: string | null = null;
    let showCc = false;
    if (email.cc) {
      const ccList = email.cc.split(',').map((r: string) => r.trim()).filter(notCurrentUser);
      if (ccList.length > 0) { cc = ccList.join(', '); showCc = true; }
    }
    return { recipients: [...new Set(recipients)].join(', '), cc, showCc };
  }

  // Regular reply
  if (isFromCurrentUser && email.to) {
    const firstRecipient = email.to.split(',').map((r: string) => r.trim()).filter(notCurrentUser)[0];
    return { recipients: firstRecipient || replyToAddress, cc: null, showCc: false };
  }
  return { recipients: replyToAddress, cc: null, showCc: false };
}

// Pure helper: builds FormData for reply with file attachments.
function buildReplyFormData(params: {
  draftToSend: string; recipients: string; replyMode: string;
  cc?: string; bcc?: string; expectedReplyHours?: number;
  forwardAttachmentIds?: string[]; scheduleTime?: Date | null;
  userTimezone: string; files: File[];
}): FormData {
  const { draftToSend, recipients, replyMode, cc, bcc, expectedReplyHours, forwardAttachmentIds, scheduleTime, userTimezone, files } = params;
  const formData = new FormData();
  formData.append('reply', draftToSend);
  formData.append('recipients', recipients);
  formData.append('replyAll', String(replyMode === REPLY_MODE_REPLY_ALL));
  if (cc) formData.append('cc', cc);
  if (bcc) formData.append('bcc', bcc);
  if (expectedReplyHours !== undefined) formData.append('expectedReplyHours', String(expectedReplyHours));
  if (forwardAttachmentIds?.length) formData.append('forwardAttachmentIds', JSON.stringify(forwardAttachmentIds));
  if (scheduleTime) { formData.append('scheduledSendAt', scheduleTime.toISOString()); formData.append('userTimezone', userTimezone); }
  files.forEach(file => formData.append('files', file));
  return formData;
}

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
  const [sending] = useState(false);
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
      const { recipients, cc, showCc: shouldShowCc } = buildReplyAddresses(mode, email, user?.email);
      setReplyRecipients(recipients);
      if (cc) { setReplyCc(cc); setShowCc(shouldShowCc); }
      setInitialAttachments(mode === REPLY_MODE_FORWARD ? (email.attachments || []) : []);
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
          const formData = buildReplyFormData({ draftToSend, recipients: currentReplyRecipients, replyMode: currentReplyMode, cc: currentReplyCc, bcc: currentReplyBcc, expectedReplyHours, forwardAttachmentIds, scheduleTime, userTimezone, files });
          await axios.post(`${API_URL}/replies/send/${emailId}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
        } else {
          await axios.post(`${API_URL}/replies/send/${emailId}`, {
            reply: draftToSend,
            recipients: currentReplyRecipients,
            cc: currentReplyCc || undefined,
            bcc: currentReplyBcc || undefined,
            replyAll: currentReplyMode === REPLY_MODE_REPLY_ALL,
            expectedReplyHours: expectedReplyHours || undefined,
            forwardAttachmentIds: forwardAttachmentIds?.length ? forwardAttachmentIds : undefined,
            scheduledSendAt: scheduleTime?.toISOString(),
            userTimezone: scheduleTime ? userTimezone : undefined,
          });
        }
        setDraft(null); setReplyCc(''); setReplyBcc(''); setShowCc(false); setShowBcc(false); setInitialAttachments([]); setScheduledSendAt(null);
        showSuccess(isScheduled ? t('emailDetail.replyScheduledSuccess') : t('emailDetail.replySentSuccess'));
      } catch (error: any) {
        console.error('Error sending reply:', error);
        setDraft(draftToSend); setReplyRecipients(currentReplyRecipients); setReplyCc(currentReplyCc); setReplyBcc(currentReplyBcc);
        setShowCc(currentShowCc); setShowBcc(currentShowBcc); setInitialAttachments(currentInitialAttachments); setScheduledSendAt(scheduleTime);
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

