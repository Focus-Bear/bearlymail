import { RefObject, useEffect, useRef } from 'react';

import { AUTO_SAVE_INTERVAL_MS } from 'constants/numbers';

interface UseEmailDetailDraftSyncParams {
  id: string | null | undefined;
  email: { id?: string; threadId?: string } | null | undefined;
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
  setReplyMode,
  setShowReplyComposer,
  setReplyOptions,
  setToneCheckResult,
  handleGenerateDraft,
}: UseEmailDetailDraftSyncParams): void => {
  // Refs for tracking previous state when switching between emails
  const previousEmailIdRef = useRef<string | null>(null);
  const previousThreadIdRef = useRef<string | null>(null);
  const previousDraftRef = useRef<string | null>(null);
  const previousReplyModeRef = useRef<'reply' | 'replyAll' | 'forward'>('reply');
  const previousRecipientsRef = useRef<string>('');

  // Save draft when switching to a different email
  useEffect(() => {
    const previousId = previousEmailIdRef.current;
    const previousThreadId = previousThreadIdRef.current;
    const previousDraft = previousDraftRef.current;
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
      setReplyOptions(null);
      setToneCheckResult(null);
    }
  }, [id, email?.threadId, setShowReplyComposer, setDraft, setReplyOptions, setToneCheckResult, saveDraft]);

  // Keep previous-state refs current for the email-switching effect above.
  useEffect(() => {
    previousDraftRef.current = draft;
  }, [draft]);
  useEffect(() => {
    previousReplyModeRef.current = replyMode;
  }, [replyMode]);
  useEffect(() => {
    previousRecipientsRef.current = replyRecipients;
  }, [replyRecipients]);

  // Load existing draft when opening an email (once per thread)
  const lastLoadedThreadIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (email?.threadId && lastLoadedThreadIdRef.current !== email.threadId) {
      lastLoadedThreadIdRef.current = email.threadId;
      const loadDraft = async () => {
        const savedDraft = await fetchDraft();
        if (savedDraft && savedDraft.content) {
          setDraft(savedDraft.content);
          setShowReplyComposer(true);
          if (savedDraft.replyMode) {
            setReplyMode(savedDraft.replyMode as 'reply' | 'replyAll');
          }
          if (savedDraft.recipients) {
            setReplyRecipients(savedDraft.recipients);
          }
        }
      };
      loadDraft();
    }
  }, [email?.threadId, fetchDraft, setDraft, setReplyRecipients, setReplyMode]);

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

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);
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
