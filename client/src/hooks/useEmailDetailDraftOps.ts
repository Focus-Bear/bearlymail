import { useCallback, useRef } from 'react';
import axios from 'axios';
import { captureEvent } from 'utils/posthog';

import { API_URL } from 'config/api';
import { REPLY_MODE_REPLY_ALL } from 'constants/strings';

import { EmailDetailState } from './useEmailDetailOperations.types';
import { useEmailDraftCrud } from './useEmailDraftCrud';

type IsCurrentUserFn = (addr: string) => boolean;

// Pure helper: builds recipients for reply-all mode.
function buildReplyAllRecipients(
  latestEmail: any,
  isCurrentUser: IsCurrentUserFn,
  isLatestFromCurrentUser: boolean | '' | undefined,
): { recipients: string; cc: string | null } {
  const recipients: string[] = [];
  if (isLatestFromCurrentUser) {
    if (latestEmail.to) {
      const toRecipients = latestEmail.to.split(',').map((r: string) => r.trim()).filter((r: string) => r && !isCurrentUser(r));
      recipients.push(...toRecipients);
    }
  } else {
    const replyToAddress = latestEmail.replyTo || latestEmail.from;
    recipients.push(replyToAddress);
    if (latestEmail.to) {
      const toRecipients = latestEmail.to.split(',').map((r: string) => r.trim()).filter((r: string) => r && !isCurrentUser(r));
      recipients.push(...toRecipients);
    }
  }
  const uniqueRecipients = [...new Set(recipients)];
  let cc: string | null = null;
  if (latestEmail.cc) {
    const ccRecipients = latestEmail.cc.split(',').map((r: string) => r.trim()).filter((r: string) => r && !isCurrentUser(r));
    if (ccRecipients.length > 0) {
      cc = ccRecipients.join(', ');
    }
  }
  return { recipients: uniqueRecipients.join(', '), cc };
}

// Pure helper: builds reply recipients given the reply mode and email context.
// Returns { recipients, cc } to be applied to state.
function buildReplyRecipientsForMode(
  mode: string,
  latestEmail: any,
  threadEmails: any[],
  userEmail: string | undefined,
): { recipients: string; cc: string | null } {
  const normalizedUserEmail = userEmail?.toLowerCase();
  const extractEmail = (addr: string): string => {
    const match = addr.match(/<([^>]+)>/);
    return match ? match[1].toLowerCase() : addr.toLowerCase();
  };
  const isCurrentUser: IsCurrentUserFn = (addr) =>
    !!normalizedUserEmail && extractEmail(addr) === normalizedUserEmail;
  const isLatestFromCurrentUser = normalizedUserEmail && isCurrentUser(latestEmail.from);

  if (mode === REPLY_MODE_REPLY_ALL) {
    return buildReplyAllRecipients(latestEmail, isCurrentUser, isLatestFromCurrentUser);
  }

  // Regular reply
  if (isLatestFromCurrentUser) {
    const otherPersonEmail = threadEmails.find((e: any) => !isCurrentUser(e.from));
    if (otherPersonEmail) {
      return { recipients: otherPersonEmail.from, cc: null };
    }
    if (latestEmail.to) {
      const firstRecipient = latestEmail.to.split(',').map((r: string) => r.trim()).filter((r: string) => r && !isCurrentUser(r))[0];
      return { recipients: firstRecipient || latestEmail.to, cc: null };
    }
    return { recipients: latestEmail.from, cc: null };
  }
  return { recipients: latestEmail.replyTo || latestEmail.from, cc: null };
}

// Pure helper: resets reply options to empty Custom state.
// Does NOT touch setDraft — the user's typed content must never be overwritten by suggestion generation.
function resetDraftToCustom(
  setReplyOptions: (opts: Array<{ label: string; text: string }> | null) => void,
  setSelectedReplyOption: (i: number) => void,
): void {
  setReplyOptions([{ label: 'Custom', text: '' }]);
  setSelectedReplyOption(0);
}

type DraftOpsState = Pick<EmailDetailState,
  | 'email' | 'threadEmails' | 'replyOptions'
  | 'setReplyOptions' | 'setDraft' | 'setSelectedReplyOption'
  | 'setLoadingReplies' | 'setReplyMode' | 'setShowReplyComposer'
  | 'setToneCheckResult' | 'setReplyRecipients' | 'setReplyCc'
  | 'setReplyBcc' | 'setShowCc' | 'setShowBcc'
>;

export function useEmailDetailDraftOps(
  id: string | undefined,
  state: DraftOpsState,
  userEmail: string | undefined,
) {
  const {
    email, threadEmails, replyOptions,
    setReplyOptions, setDraft, setSelectedReplyOption,
    setLoadingReplies, setReplyMode, setShowReplyComposer,
    setToneCheckResult, setReplyRecipients, setReplyCc,
    setReplyBcc, setShowCc, setShowBcc,
  } = state;

  const draftCrud = useEmailDraftCrud(email?.threadId);
  const draftAbortControllerRef = useRef<AbortController | null>(null);
  const draftGenerationEmailIdRef = useRef<string | null>(null);

  const handleGenerateDraft = useCallback(async () => {
    if (!id || !email) return;
    if (email.id !== id) {
      console.warn('[handleGenerateDraft] Skipping - email.id mismatch', { emailId: email.id, propId: id });
      return;
    }

    if (draftAbortControllerRef.current) {
      draftAbortControllerRef.current.abort();
    }
    const controller = new AbortController();
    draftAbortControllerRef.current = controller;
    const currentEmailId = id;
    draftGenerationEmailIdRef.current = currentEmailId;

    setLoadingReplies(true);
    try {
      const response = await axios.post(
        `${API_URL}/llm/suggest-replies`,
        { originalEmail: { from: email.from, fromName: email.fromName, subject: email.subject, body: email.body } },
        { signal: controller.signal },
      );

      if (draftGenerationEmailIdRef.current !== currentEmailId || controller.signal.aborted) return;

      if (response.data && Array.isArray(response.data) && response.data.length > 0) {
        captureEvent('reply_draft_generated', { email_id: id, draft_count: response.data.length });
        const optionsWithCustom = [{ label: 'Custom', text: '' }, ...response.data];
        setReplyOptions(optionsWithCustom);
        // Do NOT call setDraft here — suggestions arriving asynchronously must never overwrite
        // content the user has already typed in the Custom tab (fixes #562).
        setSelectedReplyOption(0);
      } else {
        resetDraftToCustom(setReplyOptions, setSelectedReplyOption);
      }
    } catch (error) {
      if (axios.isCancel(error)) return;
      if (draftGenerationEmailIdRef.current !== currentEmailId) return;
      console.error('Error generating draft:', error);
      resetDraftToCustom(setReplyOptions, setSelectedReplyOption);
    } finally {
      if (draftGenerationEmailIdRef.current === currentEmailId && !controller.signal.aborted) {
        setLoadingReplies(false);
      }
    }
  }, [id, email, setLoadingReplies, setReplyOptions, setSelectedReplyOption]);

  // eslint-disable-next-line no-restricted-syntax -- Type parameter must remain literal type for TypeScript compatibility
  const handleOpenReplyComposer = useCallback((mode: 'reply' | 'replyAll') => {
    captureEvent('reply_button_clicked', { email_id: id, reply_type: mode });
    setReplyMode(mode);
    setShowReplyComposer(true);
    setToneCheckResult(null);
    setReplyCc('');
    setReplyBcc('');
    setShowCc(false);
    setShowBcc(false);

    const latestEmail = threadEmails.length > 0
      ? threadEmails.reduce((latest, current) =>
          new Date(current.receivedAt) > new Date(latest.receivedAt) ? current : latest
        )
      : email;

    if (latestEmail) {
      const { recipients, cc } = buildReplyRecipientsForMode(mode, latestEmail, threadEmails, userEmail);
      setReplyRecipients(recipients);
      if (cc) {
        setReplyCc(cc);
        setShowCc(true);
      }
    }

    if (!replyOptions || replyOptions.length === 0) {
      setDraft('');
      handleGenerateDraft();
    } else {
      setDraft('');
    }
  }, [id, email, threadEmails, replyOptions, userEmail, setReplyMode, setShowReplyComposer, setDraft, setToneCheckResult, setReplyRecipients, setReplyCc, setReplyBcc, setShowCc, setShowBcc, handleGenerateDraft]);

  return {
    ...draftCrud,
    handleGenerateDraft,
    handleOpenReplyComposer,
  };
}
