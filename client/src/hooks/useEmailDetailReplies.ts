import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { Email } from 'types/email';
import { getAxiosErrorMessage } from 'utils/errors';
import { replaceBlobUrlsWithCids } from 'utils/inlineImageUtils';
import { markScheduledEmailSent } from 'utils/scheduledTour';

import { API_URL } from 'config/api';
import { REPLY_MODE_FORWARD, REPLY_MODE_REPLY_ALL } from 'constants/strings';
import { useAuth } from 'contexts/AuthContext';
import { useNotifications } from 'contexts/NotificationContext';
import { useEmailDetailToneCheck } from 'hooks/useEmailDetailToneCheck';
import { useReplyDraftGeneration } from 'hooks/useReplyDraftGeneration';

interface SendReplyParams {
  emailId: string;
  draftToSend: string;
  recipients: string;
  cc: string;
  bcc: string;
  replyMode: string;
  expectedReplyHours?: number;
  forwardAttachmentIds?: string[];
  scheduleTime: Date | null;
  userTimezone: string;
  files: File[];
  inlineImages?: Map<string, File>;
  isScheduled: boolean;
  setDraft: (d: string | null) => void;
  setReplyRecipients: (v: string) => void;
  setReplyCc: (v: string) => void;
  setReplyBcc: (v: string) => void;
  setShowCc: (v: boolean) => void;
  setShowBcc: (v: boolean) => void;
  setInitialAttachments: (v: EmailAttachment[]) => void;
  setScheduledSendAt: (v: Date | null) => void;
  setShowReplyComposer: (v: boolean) => void;
  showSuccess: (msg: string) => void;
  showError: (msg: string) => void;
  successMsg: string;
  errorPrefix: string;
}

async function sendReplyRequest(params: SendReplyParams): Promise<void> {
  const {
    emailId,
    draftToSend,
    recipients,
    cc,
    bcc,
    replyMode,
    expectedReplyHours,
    forwardAttachmentIds,
    scheduleTime,
    userTimezone,
    files,
    inlineImages,
  } = params;
  if (files.length > 0 || (inlineImages && inlineImages.size > 0)) {
    const formData = buildReplyFormData({
      draftToSend,
      recipients,
      replyMode,
      cc,
      bcc,
      expectedReplyHours,
      forwardAttachmentIds,
      scheduleTime,
      userTimezone,
      files,
      inlineImages,
    });
    await axios.post(`${API_URL}/replies/send/${emailId}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  } else {
    await axios.post(`${API_URL}/replies/send/${emailId}`, {
      reply: draftToSend,
      recipients,
      cc: cc || undefined,
      bcc: bcc || undefined,
      replyAll: replyMode === REPLY_MODE_REPLY_ALL,
      isForward: replyMode === REPLY_MODE_FORWARD,
      expectedReplyHours: expectedReplyHours || undefined,
      forwardAttachmentIds: forwardAttachmentIds?.length ? forwardAttachmentIds : undefined,
      scheduledSendAt: scheduleTime?.toISOString(),
      userTimezone: scheduleTime ? userTimezone : undefined,
    });
  }
}

async function executeSendReply(params: SendReplyParams): Promise<void> {
  try {
    await sendReplyRequest(params);
    params.setDraft(null);
    params.setReplyCc('');
    params.setReplyBcc('');
    params.setShowCc(false);
    params.setShowBcc(false);
    params.setInitialAttachments([]);
    params.setScheduledSendAt(null);
    if (params.isScheduled) {
      // Point users at where scheduled emails live (inbox ⋮ menu).
      markScheduledEmailSent();
    }
    params.showSuccess(params.successMsg);
  } catch (error: unknown) {
    console.error('Error sending reply:', error);
    params.setDraft(params.draftToSend);
    params.setReplyRecipients(params.recipients);
    params.setReplyCc(params.cc);
    params.setReplyBcc(params.bcc);
    params.setShowCc(!!params.cc);
    params.setShowBcc(!!params.bcc);
    params.setInitialAttachments([]);
    params.setScheduledSendAt(params.scheduleTime);
    params.setShowReplyComposer(true);
    params.showError(getAxiosErrorMessage(error, params.errorPrefix));
  }
}

// Split an RFC 5322 address list on commas that are NOT inside a double-quoted
// display name, so '"Doe, Jane" <jane@x.com>' stays a single recipient instead
// of being shattered into fragments. Mirrors the server's splitAddressList.
// Exported for unit testing.
export function splitAddressList(addressList: string): string[] {
  const parts: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < addressList.length; i++) {
    const ch = addressList[i];
    if (ch === '\\' && inQuotes && i + 1 < addressList.length) {
      current += ch + addressList[i + 1];
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = !inQuotes;
      current += ch;
      continue;
    }
    if (ch === ',' && !inQuotes) {
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter((part) => part.length > 0);
}

// Pure helper: builds recipient/cc addresses based on reply mode.
// Exported for unit testing.
export function buildReplyAddresses(
  mode: string,
  email: Email,
  userEmail: string | undefined
): { recipients: string; cc: string | null; showCc: boolean } {
  const normalizedUserEmail = userEmail?.toLowerCase();
  const extractEmail = (addr: string) => {
    const match = addr.match(/<([^>]+)>/);
    return match ? match[1].toLowerCase() : addr.toLowerCase();
  };
  const notCurrentUser = (addr: string) => !!normalizedUserEmail && extractEmail(addr) !== normalizedUserEmail;
  // Drops non-routable header tokens such as the RFC 5322 empty-group syntax
  // "undisclosed-recipients:;" used by bulk senders — copying it back into the
  // To header makes Gmail reject the whole send with "Invalid To header".
  const isRoutableAddress = (addr: string) => extractEmail(addr).includes('@');
  const isFromCurrentUser = !!normalizedUserEmail && extractEmail(email.from || '') === normalizedUserEmail;
  const replyToAddress = email.replyTo || email.from;

  if (mode === REPLY_MODE_FORWARD) {
    return { recipients: '', cc: null, showCc: false };
  }

  if (mode === REPLY_MODE_REPLY_ALL) {
    const recipients: string[] = [];
    if (isFromCurrentUser) {
      if (email.to) {
        recipients.push(
          ...splitAddressList(email.to)
            .filter(notCurrentUser)
            .filter(isRoutableAddress)
        );
      }
    } else {
      recipients.push(replyToAddress);
      if (email.to) {
        recipients.push(
          ...splitAddressList(email.to)
            .filter(notCurrentUser)
            .filter(isRoutableAddress)
        );
      }
    }
    let cc: string | null = null;
    let showCc = false;
    if (email.cc) {
      const ccList = splitAddressList(email.cc)
        .filter(notCurrentUser)
        .filter(isRoutableAddress);
      if (ccList.length > 0) {
        cc = ccList.join(', ');
        showCc = true;
      }
    }
    return { recipients: [...new Set(recipients)].join(', '), cc, showCc };
  }

  // Regular reply
  if (isFromCurrentUser && email.to) {
    const firstRecipient = splitAddressList(email.to)
      .filter(notCurrentUser)
      .filter(isRoutableAddress)[0];
    return { recipients: firstRecipient || replyToAddress, cc: null, showCc: false };
  }
  return { recipients: replyToAddress, cc: null, showCc: false };
}

// Pure helper: builds FormData for reply with file attachments and inline images.
function buildReplyFormData(params: {
  draftToSend: string;
  recipients: string;
  replyMode: string;
  cc?: string;
  bcc?: string;
  expectedReplyHours?: number;
  forwardAttachmentIds?: string[];
  scheduleTime?: Date | null;
  userTimezone: string;
  files: File[];
  /** Map of CID → File for inline images embedded via <img src="cid:…"> */
  inlineImages?: Map<string, File>;
}): FormData {
  const {
    draftToSend,
    recipients,
    replyMode,
    cc,
    bcc,
    expectedReplyHours,
    forwardAttachmentIds,
    scheduleTime,
    userTimezone,
    files,
    inlineImages,
  } = params;
  const formData = new FormData();
  formData.append('reply', draftToSend);
  formData.append('recipients', recipients);
  formData.append('replyAll', String(replyMode === REPLY_MODE_REPLY_ALL));
  formData.append('isForward', String(replyMode === REPLY_MODE_FORWARD));
  if (cc) {
    formData.append('cc', cc);
  }
  if (bcc) {
    formData.append('bcc', bcc);
  }
  if (expectedReplyHours !== undefined) {
    formData.append('expectedReplyHours', String(expectedReplyHours));
  }
  if (forwardAttachmentIds?.length) {
    formData.append('forwardAttachmentIds', JSON.stringify(forwardAttachmentIds));
  }
  if (scheduleTime) {
    formData.append('scheduledSendAt', scheduleTime.toISOString());
    formData.append('userTimezone', userTimezone);
  }
  files.forEach(file => formData.append('files', file));
  // Inline images are sent as 'inlineImages' with the CID encoded in the filename
  // as "<cid>::::<original_filename>". The server parses the CID from the filename
  // prefix and attaches each image as a MIME Content-ID inline part.
  if (inlineImages) {
    inlineImages.forEach((file, cid) => {
      const encodedName = `${cid}::::${file.name}`;
      formData.append('inlineImages', file, encodedName);
    });
  }
  return formData;
}

interface EmailAttachment {
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
}

// Sub-hook: manages all reply composer UI state plus scheduling handlers.
function useReplyComposerState() {
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

  const handleOpenTimePicker = useCallback(() => setShowTimePicker(true), []);
  const handleTimeSelect = useCallback((time: Date) => {
    setScheduledSendAt(time);
    setShowTimePicker(false);
  }, []);
  const handleCancelTimePicker = useCallback(() => setShowTimePicker(false), []);

  return {
    showReplyComposer,
    setShowReplyComposer,
    replyMode,
    setReplyMode,
    replyRecipients,
    setReplyRecipients,
    replyCc,
    setReplyCc,
    replyBcc,
    setReplyBcc,
    showCc,
    setShowCc,
    showBcc,
    setShowBcc,
    sending,
    initialAttachments,
    setInitialAttachments,
    showTimePicker,
    scheduledSendAt,
    setScheduledSendAt,
    handleOpenTimePicker,
    handleTimeSelect,
    handleCancelTimePicker,
  };
}

interface SendReplyHandlerDeps {
  emailId: string;
  draft: string | null;
  replyRecipients: string;
  replyCc: string;
  replyBcc: string;
  replyMode: string;
  scheduledSendAt: Date | null;
  checkTone: (draft: string, scheduledSendAt?: string | null) => Promise<boolean>;
  setDraft: (d: string | null) => void;
  setReplyCc: (v: string) => void;
  setReplyBcc: (v: string) => void;
  setShowCc: (v: boolean) => void;
  setShowBcc: (v: boolean) => void;
  setInitialAttachments: (v: EmailAttachment[]) => void;
  setScheduledSendAt: (v: Date | null) => void;
  setReplyRecipients: (v: string) => void;
  setShowReplyComposer: (v: boolean) => void;
  showSuccess: (msg: string) => void;
  showError: (msg: string) => void;
  t: (key: string) => string;
}

// Sub-hook: builds and returns the memoized handleSendReply callback.
function useSendReplyHandler(deps: SendReplyHandlerDeps) {
  const {
    emailId,
    draft,
    replyRecipients,
    replyCc,
    replyBcc,
    replyMode,
    scheduledSendAt,
    checkTone,
    setDraft,
    setReplyCc,
    setReplyBcc,
    setShowCc,
    setShowBcc,
    setInitialAttachments,
    setScheduledSendAt,
    setReplyRecipients,
    setShowReplyComposer,
    showSuccess,
    showError,
    t,
  } = deps;

  return useCallback(
    async (
      sendOptions: {
        files?: File[];
        expectedReplyHours?: number;
        forwardAttachmentIds?: string[];
        onClose?: () => void;
        draftOverride?: string;
        scheduledSendAtOverride?: Date;
      } = {}
    ) => {
      const {
        files = [],
        expectedReplyHours,
        forwardAttachmentIds,
        onClose,
        draftOverride,
        scheduledSendAtOverride,
      } = sendOptions;
      const isForward = replyMode === REPLY_MODE_FORWARD;
      const rawDraft = draftOverride ?? draft ?? '';
      const scheduleTime = scheduledSendAtOverride || scheduledSendAt;
      // Forwards may be sent without added text — the forwarded message is the content.
      if (!emailId || (!rawDraft && !isForward)) {
        return;
      }
      // Swap blob: preview URLs back to cid: references before tone-check and send.
      const draftToSend = replaceBlobUrlsWithCids(rawDraft);
      // Pass the scheduled send time so the server can suppress timing nags when
      // the user has already queued the email for a specific delivery time.
      // A provided draftOverride is a deliberate override (revised text or
      // hold-to-send-anyway) and skips the check; so does an empty forward body.
      if (
        draftOverride === undefined &&
        draftToSend.trim() &&
        !(await checkTone(draftToSend, scheduleTime?.toISOString() ?? null))
      ) {
        return;
      }
      setShowReplyComposer(false);
      if (onClose) {
        onClose();
      }
      const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      executeSendReply({
        emailId,
        draftToSend,
        recipients: replyRecipients,
        cc: replyCc,
        bcc: replyBcc,
        replyMode,
        expectedReplyHours,
        forwardAttachmentIds,
        scheduleTime,
        userTimezone,
        files,
        isScheduled: !!scheduleTime,
        setDraft,
        setReplyRecipients,
        setReplyCc,
        setReplyBcc,
        setShowCc,
        setShowBcc,
        setInitialAttachments,
        setScheduledSendAt,
        setShowReplyComposer,
        showSuccess,
        showError,
        successMsg: scheduleTime ? t('emailDetail.replyScheduledSuccess') : t('emailDetail.replySentSuccess'),
        errorPrefix: t('emailDetail.replySentError'),
      });
    },
    [
      emailId,
      draft,
      replyRecipients,
      replyCc,
      replyBcc,
      replyMode,
      scheduledSendAt,
      checkTone,
      setDraft,
      setReplyCc,
      setReplyBcc,
      setShowCc,
      setShowBcc,
      setInitialAttachments,
      setScheduledSendAt,
      setReplyRecipients,
      setShowReplyComposer,
      showSuccess,
      showError,
      t,
    ]
  );
}

interface UseEmailDetailRepliesOptions {
  autoGenerateReplies?: boolean;
}

export function useEmailDetailReplies(
  emailId: string,
  email: Email | null,
  options: UseEmailDetailRepliesOptions = {}
) {
  const { autoGenerateReplies = false } = options;
  const { t } = useTranslation();
  const { showSuccess, showError } = useNotifications();
  const { user } = useAuth();

  const composerState = useReplyComposerState();
  const {
    setShowReplyComposer,
    setReplyMode,
    setReplyRecipients,
    setReplyCc,
    setReplyBcc,
    setShowCc,
    setShowBcc,
    setInitialAttachments,
    setScheduledSendAt,
    replyRecipients,
    replyCc,
    replyBcc,
    replyMode,
    scheduledSendAt,
  } = composerState;

  const {
    checkingTone,
    toneCheckResult,
    setToneCheckResult,
    checkTone,
    cancelToneCheck,
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

  const handleOpenReplyComposer = useCallback(
    (mode: 'reply' | 'replyAll' | 'forward') => {
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
        if (cc) {
          setReplyCc(cc);
          setShowCc(shouldShowCc);
        }
        const forwardAttachments = Array.isArray(email.attachments) ? email.attachments : [];
        setInitialAttachments(mode === REPLY_MODE_FORWARD ? forwardAttachments : []);
      }
      // Bug 7 fix: AI draft generation is only relevant for replies, not forwards.
      if (mode !== REPLY_MODE_FORWARD) {
        handleGenerateDraft();
      }
    },
    [
      email,
      user?.email,
      handleGenerateDraft,
      setDraft,
      setToneCheckResult,
      setReplyMode,
      setShowReplyComposer,
      setReplyCc,
      setReplyBcc,
      setShowCc,
      setShowBcc,
      setReplyRecipients,
      setInitialAttachments,
    ]
  );

  const handleSendReply = useSendReplyHandler({
    emailId,
    draft,
    replyRecipients,
    replyCc,
    replyBcc,
    replyMode,
    scheduledSendAt,
    checkTone,
    setDraft,
    setReplyCc,
    setReplyBcc,
    setShowCc,
    setShowBcc,
    setInitialAttachments,
    setScheduledSendAt,
    setReplyRecipients,
    setShowReplyComposer,
    showSuccess,
    showError,
    t,
  });

  return {
    ...composerState,
    replyOptions,
    selectedReplyOption,
    draft,
    loadingReplies,
    checkingTone,
    toneCheckResult,
    disputing,
    disputeResult,
    replyGenerationDebugInfo,
    setDraft,
    setSelectedReplyOption,
    setReplyOptions,
    setToneCheckResult,
    handleOpenReplyComposer,
    handleSendReply,
    cancelToneCheck,
    disputeToneCheck,
    clearDisputeResult,
  };
}
