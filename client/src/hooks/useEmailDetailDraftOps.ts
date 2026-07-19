import { useCallback, useRef, useState } from 'react';
import axios from 'axios';
import { Email } from 'types/email';
import { sanitizeAndProcessHtml } from 'utils/emailBodyUtils';
import { normalizeAiReplyPlaintext, plainTextToHtml } from 'utils/emailUtils';
import { captureEvent } from 'utils/posthog';

import { API_URL } from 'config/api';
import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import { REPLY_MODE_FORWARD, REPLY_MODE_REPLY_ALL } from 'constants/strings';

import { buildReplyAllRecipients, IsCurrentUserFn } from './buildReplyAllRecipients';
import { EmailDetailState } from './useEmailDetailOperations.types';
import { useEmailDraftCrud } from './useEmailDraftCrud';

export type { IsCurrentUserFn } from './buildReplyAllRecipients';
export { buildReplyAllRecipients } from './buildReplyAllRecipients';

// Pure helper: builds reply recipients given the reply mode and email context.
// Returns { recipients, cc } to be applied to state.
function buildReplyRecipientsForMode(
  mode: string,
  targetEmail: Email,
  threadEmails: Email[],
  userEmail: string | undefined
): { recipients: string; cc: string | null } {
  const normalizedUserEmail = userEmail?.toLowerCase();
  const extractEmail = (addr: string): string => {
    const match = addr.match(/<([^>]+)>/);
    return match ? match[1].toLowerCase() : addr.toLowerCase();
  };
  const isCurrentUser: IsCurrentUserFn = addr => !!normalizedUserEmail && extractEmail(addr) === normalizedUserEmail;
  const isTargetFromCurrentUser = normalizedUserEmail && isCurrentUser(targetEmail.from);

  if (mode === REPLY_MODE_FORWARD) {
    // Forwards start with empty recipient field — the user fills in a new destination
    return { recipients: '', cc: null };
  }

  if (mode === REPLY_MODE_REPLY_ALL) {
    return buildReplyAllRecipients(targetEmail, isCurrentUser, isTargetFromCurrentUser);
  }

  // Regular reply
  if (isTargetFromCurrentUser) {
    const otherPersonEmail = threadEmails.find(event => !isCurrentUser(event.from));
    if (otherPersonEmail) {
      return { recipients: otherPersonEmail.from, cc: null };
    }
    if (targetEmail.to) {
      const firstRecipient = targetEmail.to
        .split(',')
        .map((recipientStr: string) => recipientStr.trim())
        .filter((recipientStr: string) => recipientStr && !isCurrentUser(recipientStr))[0];
      return { recipients: firstRecipient || targetEmail.to, cc: null };
    }
    return { recipients: targetEmail.from, cc: null };
  }
  return { recipients: targetEmail.replyTo || targetEmail.from, cc: null };
}

const CUSTOM_ONLY_OPTIONS = [{ label: 'Custom', text: '' }];

interface SuggestedReplyResponse {
  options: Array<{ label: string; text: string }>;
  isGenerating: boolean;
  lastEmailId: string | null;
}

// Pure helper: resets reply options to empty Custom state.
// Does NOT touch setDraft — the user's typed content must never be overwritten by suggestion generation.
function resetDraftToCustom(
  setReplyOptions: (opts: Array<{ label: string; text: string }> | null) => void,
  setSelectedReplyOption: (i: number) => void
): void {
  setReplyOptions(CUSTOM_ONLY_OPTIONS);
  setSelectedReplyOption(-1);
}

// Pure helper: applies generated options to state, converting plain text to HTML.
// Only resets selection to -1 if no explicit selection has been made yet, to avoid
// overriding a custom-prompt selection (which sets the option to 0).
function applyRawOptions(
  rawOptions: Array<{ label: string; text: string }> | null,
  setReplyOptions: (opts: Array<{ label: string; text: string }> | null) => void,
  setSelectedReplyOption: (i: number) => void,
  currentSelectedReplyOption: number
): void {
  if (rawOptions && rawOptions.length > 0) {
    const htmlOptions = rawOptions.map(opt => ({
      ...opt,
      text: sanitizeAndProcessHtml(plainTextToHtml(normalizeAiReplyPlaintext(opt.text))),
    }));
    setReplyOptions([{ label: 'Custom', text: '' }, ...htmlOptions]);
  } else {
    setReplyOptions(CUSTOM_ONLY_OPTIONS);
  }
  if (currentSelectedReplyOption === -1) {
    setSelectedReplyOption(-1);
  }
}

type DraftOpsState = Pick<
  EmailDetailState,
  | 'email'
  | 'threadEmails'
  | 'replyOptions'
  | 'setReplyOptions'
  | 'setDraft'
  | 'selectedReplyOption'
  | 'setSelectedReplyOption'
  | 'setLoadingReplies'
  | 'setReplyMode'
  | 'setReplyTargetEmailId'
  | 'setShowReplyComposer'
  | 'setToneCheckResult'
  | 'setReplyRecipients'
  | 'setReplyCc'
  | 'setReplyBcc'
  | 'setReplySubject'
  | 'setShowCc'
  | 'setShowBcc'
>;

// Sub-hook: encapsulates draft generation logic with its own abort-controller refs.
// Checks pre-generated suggestions first, then falls back to on-demand LLM call.
function useDraftGenerationCallback(
  id: string | undefined,
  email: Email | null,
  setLoadingReplies: (v: boolean) => void,
  setReplyOptions: (opts: Array<{ label: string; text: string }> | null) => void,
  setSelectedReplyOption: (i: number) => void,
  selectedReplyOption: number
): () => Promise<void> {
  const draftAbortControllerRef = useRef<AbortController | null>(null);
  const draftGenerationEmailIdRef = useRef<string | null>(null);
  // Read selectedReplyOption via ref so this callback's identity stays stable when the
  // user clicks a tab button. Without this, every tab click recreates handleGenerateDraft,
  // which causes useAutoGenerateReplies to abort the in-flight auto-generation and restart
  // it — leaving loadingReplies stuck at true while the custom reply is already ready.
  const selectedReplyOptionRef = useRef(selectedReplyOption);
  selectedReplyOptionRef.current = selectedReplyOption;

  return useCallback(async () => {
    if (!id || !email) {
      return;
    }
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
      // Step 1: Check pre-generated suggestions from background job
      let rawOptions: Array<{ label: string; text: string }> | null = null;
      if (email.emailThreadId) {
        try {
          const preGenResponse = await axios.get<SuggestedReplyResponse>(
            `${API_URL}/suggested-replies/${email.emailThreadId}`,
            { signal: controller.signal }
          );
          if (draftGenerationEmailIdRef.current !== currentEmailId || controller.signal.aborted) {
            return;
          }
          const preGen = preGenResponse.data;
          if (preGen?.options?.length > 0) {
            rawOptions = preGen.options;
            captureEvent(ANALYTICS_EVENTS.REPLY_DRAFT_GENERATED, {
              email_id: id,
              draft_count: rawOptions.length,
              source: 'pre_generated',
            });
          }
          // If still generating in background but no options yet, fall through to on-demand
        } catch {
          // Pre-generated fetch failed; fall through to on-demand
          if (controller.signal.aborted) {
            return;
          }
        }
      }

      // Step 2: On-demand generation if no pre-generated options
      if (!rawOptions) {
        if (draftGenerationEmailIdRef.current !== currentEmailId || controller.signal.aborted) {
          return;
        }
        const response = await axios.post(
          `${API_URL}/llm/suggest-replies`,
          { originalEmail: { from: email.from, fromName: email.fromName, subject: email.subject, body: email.body } },
          { signal: controller.signal }
        );
        if (draftGenerationEmailIdRef.current !== currentEmailId || controller.signal.aborted) {
          return;
        }
        if (response.data && Array.isArray(response.data) && response.data.length > 0) {
          rawOptions = response.data;
          captureEvent(ANALYTICS_EVENTS.REPLY_DRAFT_GENERATED, {
            email_id: id,
            draft_count: rawOptions.length,
            source: 'on_demand',
          });
        }
      }

      applyRawOptions(rawOptions, setReplyOptions, setSelectedReplyOption, selectedReplyOptionRef.current);
    } catch (error) {
      if (axios.isCancel(error) || controller.signal.aborted) {
        return;
      }
      if (draftGenerationEmailIdRef.current !== currentEmailId) {
        return;
      }
      console.error('Error generating draft:', error);
      resetDraftToCustom(setReplyOptions, setSelectedReplyOption);
    } finally {
      if (draftGenerationEmailIdRef.current === currentEmailId && !controller.signal.aborted) {
        setLoadingReplies(false);
      }
    }
  }, [id, email, setLoadingReplies, setReplyOptions, setSelectedReplyOption]);
}

// Sub-hook: generates a single reply from a custom user prompt.
function useGenerateFromCustomPromptCallback(
  id: string | undefined,
  email: Email | null,
  setSelectedReplyOption: (i: number) => void,
  setDraft: (draft: string) => void
): [(prompt: string) => Promise<void>, boolean] {
  const [generating, setGenerating] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const generate = useCallback(
    async (userInstructions: string) => {
      if (!id || !email || !userInstructions.trim()) {
        return;
      }
      if (abortRef.current) {
        abortRef.current.abort();
      }
      const controller = new AbortController();
      abortRef.current = controller;
      setGenerating(true);
      try {
        const response = await axios.post(
          `${API_URL}/llm/suggest-replies`,
          {
            originalEmail: { from: email.from, fromName: email.fromName, subject: email.subject, body: email.body },
            userInstructions: userInstructions.trim(),
          },
          { signal: controller.signal }
        );
        if (controller.signal.aborted) {
          return;
        }
        const rawOptions: Array<{ label: string; text: string }> = response.data ?? [];
        if (rawOptions.length > 0) {
          const htmlText = sanitizeAndProcessHtml(plainTextToHtml(normalizeAiReplyPlaintext(rawOptions[0].text)));
          // Update options list: keep Custom + existing AI options, but set draft to generated text
          setDraft(htmlText);
          // Select Custom tab (index 0) so the generated text appears in the textarea
          setSelectedReplyOption(0);
        }
      } catch (error) {
        if (axios.isCancel(error) || controller.signal.aborted) {
          return;
        }
        console.error('Error generating custom reply:', error);
      } finally {
        if (!controller.signal.aborted) {
          setGenerating(false);
        }
      }
    },
    [id, email, setSelectedReplyOption, setDraft]
  );

  return [generate, generating];
}

export function useEmailDetailDraftOps(id: string | undefined, state: DraftOpsState, userEmail: string | undefined) {
  const {
    email,
    threadEmails,
    replyOptions,
    setReplyOptions,
    setDraft,
    selectedReplyOption,
    setSelectedReplyOption,
    setLoadingReplies,
    setReplyMode,
    setReplyTargetEmailId,
    setShowReplyComposer,
    setToneCheckResult,
    setReplyRecipients,
    setReplyCc,
    setReplyBcc,
    setReplySubject,
    setShowCc,
    setShowBcc,
  } = state;

  const draftCrud = useEmailDraftCrud(email?.threadId);
  const handleGenerateDraft = useDraftGenerationCallback(
    id,
    email,
    setLoadingReplies,
    setReplyOptions,
    setSelectedReplyOption,
    selectedReplyOption
  );
  const [generateFromCustomPrompt, generatingFromCustomPrompt] = useGenerateFromCustomPromptCallback(
    id,
    email,
    setSelectedReplyOption,
    setDraft
  );

  const handleOpenReplyComposer = useCallback(
    (mode: 'reply' | 'replyAll' | 'forward', targetEmailId?: string) => {
      const resolvedTargetId = targetEmailId ?? id;
      captureEvent(ANALYTICS_EVENTS.REPLY_BUTTON_CLICKED, { email_id: resolvedTargetId, reply_type: mode });
      setReplyMode(mode);
      // Remember which thread message this reply/forward targets so the send request
      // (recipients, subject, forwarded attachments) is derived from and dispatched
      // against that message rather than always the newest one.
      setReplyTargetEmailId(targetEmailId ?? null);
      setShowReplyComposer(true);
      setToneCheckResult(null);
      setReplyCc('');
      setReplyBcc('');
      setShowCc(false);
      setShowBcc(false);

      // Reply / Reply All apply to the targeted message (an explicitly chosen earlier
      // message, else the one being viewed via route `id`), not the newest message in
      // the thread — otherwise CC/To from the selected message are ignored.
      const latestByTime =
        threadEmails.length > 0
          ? threadEmails.reduce((latest, current) =>
              new Date(current.receivedAt) > new Date(latest.receivedAt) ? current : latest
            )
          : null;
      const targetEmail =
        threadEmails.find(threadMsg => threadMsg.id === resolvedTargetId) ?? email ?? latestByTime;

      if (targetEmail) {
        const { recipients, cc } = buildReplyRecipientsForMode(mode, targetEmail, threadEmails, userEmail);
        setReplyRecipients(recipients);
        if (cc) {
          setReplyCc(cc);
          setShowCc(true);
        }
        const rawSubject = targetEmail.subject || '';
        if (mode === REPLY_MODE_FORWARD) {
          setReplySubject(rawSubject.toLowerCase().startsWith('fwd:') ? rawSubject : `Fwd: ${rawSubject}`);
        } else {
          setReplySubject(rawSubject.toLowerCase().startsWith('re:') ? rawSubject : `Re: ${rawSubject}`);
        }
      }

      // AI draft generation is only meaningful for replies, not forwards
      if (mode !== REPLY_MODE_FORWARD) {
        if (!replyOptions || replyOptions.length === 0) {
          setDraft('');
          handleGenerateDraft();
        } else {
          setDraft('');
        }
      } else {
        setDraft('');
      }
    },
    [
      id,
      email,
      threadEmails,
      replyOptions,
      userEmail,
      setReplyMode,
      setReplyTargetEmailId,
      setShowReplyComposer,
      setDraft,
      setToneCheckResult,
      setReplyRecipients,
      setReplyCc,
      setReplyBcc,
      setReplySubject,
      setShowCc,
      setShowBcc,
      handleGenerateDraft,
    ]
  );

  return {
    ...draftCrud,
    handleGenerateDraft,
    handleOpenReplyComposer,
    generateFromCustomPrompt,
    generatingFromCustomPrompt,
  };
}
