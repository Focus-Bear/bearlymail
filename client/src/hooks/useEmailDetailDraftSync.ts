import { RefObject, useEffect, useRef } from 'react';
import { buildReplySubject } from 'utils/replySubject';

import { AUTO_SAVE_INTERVAL_MS } from 'constants/numbers';
import { REPLY_MODE_REPLY } from 'constants/strings';

interface UseEmailDetailDraftSyncParams {
  id: string | null | undefined;
  email: { id?: string; threadId?: string; subject?: string } | null | undefined;
  draft: string | null;
  replyMode: 'reply' | 'replyAll' | 'forward';
  replyRecipients: string;
  autoGenerateReplies: boolean;
  replyOptions: unknown;
  showReplyComposer: boolean;
  replyComposerRef: RefObject<HTMLDivElement | null>;
  saveDraft: (draft: string, mode: 'reply' | 'replyAll' | 'forward', recipients: string, threadId?: string) => void | Promise<void>;
  fetchDraft: () => Promise<{ content?: string; replyMode?: string; recipients?: string } | null | undefined>;
  setDraft: (draft: string) => void;
  setReplyRecipients: (recipients: string) => void;
  setReplySubject: (subject: string) => void;
  setReplyMode: (mode: 'reply' | 'replyAll' | 'forward') => void;
  setShowReplyComposer: (show: boolean) => void;
  setReplyOptions: (options: Array<{ label: string; text: string }> | null) => void;
  setToneCheckResult: (result: null) => void;
  handleGenerateDraft: () => void;
}

export const useEmailDetailDraftSync = ({
  id,
  email,
  draft,
  replyMode,
  replyRecipients,
  autoGenerateReplies,
  replyOptions,
  showReplyComposer,
  replyComposerRef,
  saveDraft,
  fetchDraft,
  setDraft,
  setReplyRecipients,
  setReplySubject,
  setReplyMode,
  setShowReplyComposer,
  setReplyOptions,
  setToneCheckResult,
  handleGenerateDraft,
}: UseEmailDetailDraftSyncParams): void => {
  // Refs for tracking previous state when switching between emails
  const previousEmailIdRef = useRef<string | null>(null);
  const previousThreadIdRef = useRef<string | null>(null);
  const latestDraftRef = useRef<string | null>(null);
  const previousReplyModeRef = useRef<'reply' | 'replyAll' | 'forward'>('reply');
  const previousRecipientsRef = useRef<string>('');

  // Save draft when switching to a different email
  useEffect(() => {
    const previousId = previousEmailIdRef.current;
    const previousThreadId = previousThreadIdRef.current;
    const previousDraft = latestDraftRef.current;
    const previousMode = previousReplyModeRef.current;
    const previousRecipients = previousRecipientsRef.current;

    if (previousId && previousId !== id && previousThreadId && previousDraft && previousDraft.trim()) {
      // Pass previousThreadId explicitly: by the time this effect runs, saveDraft's
      // closure already references the NEW email's threadId, so without this the draft
      // would be saved under the wrong thread.
      saveDraft(previousDraft, previousMode, previousRecipients, previousThreadId);
    }

    previousEmailIdRef.current = id || null;
    previousThreadIdRef.current = email?.threadId || null;

    if (previousId !== id) {
      setShowReplyComposer(false);
      setDraft('');
      // Mirror the reset now rather than on the next render, so the newly opened
      // thread's draft restore never mistakes the previous email's text for typing.
      latestDraftRef.current = '';
      setReplyOptions(null);
      setToneCheckResult(null);
    }
  }, [id, email?.threadId, setShowReplyComposer, setDraft, setReplyOptions, setToneCheckResult, saveDraft]);

  // Keep previous-state refs current for the email-switching effect above and the
  // draft restore below.
  useEffect(() => {
    latestDraftRef.current = draft;
  }, [draft]);
  useEffect(() => {
    previousReplyModeRef.current = replyMode;
  }, [replyMode]);
  useEffect(() => {
    previousRecipientsRef.current = replyRecipients;
  }, [replyRecipients]);

  useRestoreSavedDraft({
    email,
    latestDraftRef,
    fetchDraft,
    setDraft,
    setShowReplyComposer,
    setReplyRecipients,
    setReplySubject,
    setReplyMode,
  });

  useAutoSaveDraft({
    showReplyComposer,
    threadId: email?.threadId,
    draft: draft ?? '',
    replyMode,
    replyRecipients,
    saveDraft,
  });

  // Scroll to reply composer when it opens
  useEffect(() => {
    if (showReplyComposer && replyComposerRef.current) {
      setTimeout(() => {
        replyComposerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, [showReplyComposer, replyComposerRef]);

  useAutoGenerateReplies({ autoGenerateReplies, id, email, draft, replyOptions, handleGenerateDraft });
};

interface RestoreSavedDraftParams
  extends Pick<
    UseEmailDetailDraftSyncParams,
    | 'email'
    | 'fetchDraft'
    | 'setDraft'
    | 'setShowReplyComposer'
    | 'setReplyRecipients'
    | 'setReplySubject'
    | 'setReplyMode'
  > {
  /** The composer's current body, read when the saved draft arrives. */
  latestDraftRef: RefObject<string | null>;
}

/**
 * Restores the saved draft exactly once per opened thread. From then on the
 * composer's local state is the source of truth — autosave only ever writes —
 * so a late response must not overwrite what the user has typed meanwhile, nor
 * land in a thread they have already left.
 */
function useRestoreSavedDraft({
  email,
  latestDraftRef,
  fetchDraft,
  setDraft,
  setShowReplyComposer,
  setReplyRecipients,
  setReplySubject,
  setReplyMode,
}: RestoreSavedDraftParams): void {
  const lastLoadedThreadIdRef = useRef<string | null>(null);
  useEffect(() => {
    const threadId = email?.threadId;
    if (!threadId || lastLoadedThreadIdRef.current === threadId) {
      return;
    }
    lastLoadedThreadIdRef.current = threadId;
    const subject = email?.subject;
    const restoreSavedDraft = async () => {
      const savedDraft = await fetchDraft();
      const isStillOpen = lastLoadedThreadIdRef.current === threadId;
      const hasTypedSinceOpening = Boolean(latestDraftRef.current?.trim());
      if (!savedDraft?.content || !isStillOpen || hasTypedSinceOpening) {
        return;
      }
      const restoredMode = (savedDraft.replyMode as 'reply' | 'replyAll' | 'forward' | undefined) ?? REPLY_MODE_REPLY;
      setDraft(savedDraft.content);
      setShowReplyComposer(true);
      if (savedDraft.replyMode) {
        setReplyMode(restoredMode);
      }
      if (savedDraft.recipients) {
        setReplyRecipients(savedDraft.recipients);
      }
      // Saved drafts don't store a subject, and only the Reply buttons fill it
      // in — without this a restored draft showed an empty Subject field.
      setReplySubject(buildReplySubject(restoredMode, subject));
    };
    void restoreSavedDraft();
  }, [
    email?.threadId,
    email?.subject,
    latestDraftRef,
    fetchDraft,
    setDraft,
    setShowReplyComposer,
    setReplyRecipients,
    setReplySubject,
    setReplyMode,
  ]);
}

/**
 * Periodically auto-saves the draft to the server while the reply composer is open.
 *
 * Fix #978: The `draft`, `replyMode`, and `replyRecipients` values are accessed via
 * refs rather than being listed as effect dependencies. The previous implementation
 * included `draft` in the dependency array, which caused the setInterval to be torn
 * down and recreated on every single keystroke (because `draft` changes on every
 * character). With refs the interval fires once per AUTO_SAVE_INTERVAL_MS and always
 * reads the latest values — no interval thrashing, no re-render cascade.
 */
interface UseAutoSaveDraftParams {
  showReplyComposer: boolean;
  threadId: string | undefined;
  draft: string;
  replyMode: 'reply' | 'replyAll' | 'forward';
  replyRecipients: string;
  saveDraft: (draft: string, mode: 'reply' | 'replyAll' | 'forward', recipients: string, threadId?: string) => void | Promise<void>;
}

function useAutoSaveDraft({
  showReplyComposer,
  threadId,
  draft,
  replyMode,
  replyRecipients,
  saveDraft,
}: UseAutoSaveDraftParams): void {
  const draftRef = useRef(draft);
  const replyModeRef = useRef(replyMode);
  const replyRecipientsRef = useRef(replyRecipients);
  const saveDraftFnRef = useRef(saveDraft);
  const isComposerOpenRef = useRef(showReplyComposer);
  const threadIdRef = useRef(threadId);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);
  useEffect(() => {
    isComposerOpenRef.current = showReplyComposer;
  }, [showReplyComposer]);
  useEffect(() => {
    threadIdRef.current = threadId;
  }, [threadId]);
  useEffect(() => {
    replyModeRef.current = replyMode;
  }, [replyMode]);
  useEffect(() => {
    replyRecipientsRef.current = replyRecipients;
  }, [replyRecipients]);
  useEffect(() => {
    saveDraftFnRef.current = saveDraft;
  }, [saveDraft]);

  useEffect(() => {
    if (!showReplyComposer || !threadId) {
      return;
    }

    const autoSaveInterval = setInterval(() => {
      const currentDraft = draftRef.current;
      if (currentDraft && currentDraft.trim()) {
        saveDraftFnRef.current(currentDraft, replyModeRef.current, replyRecipientsRef.current);
      }
    }, AUTO_SAVE_INTERVAL_MS);

    return () => {
      clearInterval(autoSaveInterval);
    };
  }, [showReplyComposer, threadId]);

  // The inbox split view remounts the email panel for each email (and unmounts it
  // on close), so the email-switch save never runs there. Save an open reply on
  // unmount instead. Closing, sending or discarding clears the draft first, so
  // this never brings back a reply the user got rid of.
  useEffect(
    () => () => {
      const pendingDraft = draftRef.current;
      if (isComposerOpenRef.current && threadIdRef.current && pendingDraft && pendingDraft.trim()) {
        saveDraftFnRef.current(pendingDraft, replyModeRef.current, replyRecipientsRef.current, threadIdRef.current);
      }
    },
    []
  );
}

function useAutoGenerateReplies({
  autoGenerateReplies,
  id,
  email,
  draft,
  replyOptions,
  handleGenerateDraft,
}: Pick<
  UseEmailDetailDraftSyncParams,
  'autoGenerateReplies' | 'id' | 'email' | 'draft' | 'replyOptions' | 'handleGenerateDraft'
>) {
  const hasDraftRef = useRef<boolean>(false);
  useEffect(() => {
    hasDraftRef.current = !!(draft && draft.trim());
  }, [draft]);

  const autoGeneratedRef = useRef<string | null>(null);
  useEffect(() => {
    if (
      autoGenerateReplies &&
      id &&
      email &&
      autoGeneratedRef.current !== id &&
      !replyOptions &&
      !hasDraftRef.current
    ) {
      autoGeneratedRef.current = id;
      handleGenerateDraft();
    }
  }, [autoGenerateReplies, id, email, replyOptions, handleGenerateDraft]);
}
