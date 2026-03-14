import { RefObject, useEffect, useRef } from 'react';
import { Email } from 'types/email';

import { AUTO_SAVE_INTERVAL_MS } from 'constants/numbers';

interface UseEmailDetailDraftSyncParams {
  id: string | undefined;
  email: Email | null | undefined;
  draft: string;
  replyMode: 'reply' | 'replyAll';
  replyRecipients: string;
  autoGenerateReplies: boolean;
  replyOptions: unknown;
  showReplyComposer: boolean;
  replyComposerRef: RefObject<HTMLDivElement>;
  saveDraft: (draft: string, mode: string, recipients: string) => void;
  fetchDraft: () => Promise<{ content?: string; replyMode?: string; recipients?: string } | null | undefined>;
  setDraft: (draft: string) => void;
  setReplyRecipients: (recipients: string) => void;
  setReplyMode: (mode: 'reply' | 'replyAll') => void;
  setShowReplyComposer: (show: boolean) => void;
  setReplyOptions: (options: unknown) => void;
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
  const previousReplyModeRef = useRef<'reply' | 'replyAll'>('reply');
  const previousRecipientsRef = useRef<string>('');

  // Save draft when switching to a different email
  useEffect(() => {
    const previousId = previousEmailIdRef.current;
    const previousThreadId = previousThreadIdRef.current;
    const previousDraft = previousDraftRef.current;
    const previousMode = previousReplyModeRef.current;
    const previousRecipients = previousRecipientsRef.current;

    if (previousId && previousId !== id && previousThreadId && previousDraft && previousDraft.trim()) {
      saveDraft(previousDraft, previousMode, previousRecipients);
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

  // Keep refs updated with current draft state
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

  // Auto-save draft every 10 seconds while reply composer is open
  useEffect(() => {
    if (!showReplyComposer || !email?.threadId) {
      return;
    }

    const autoSaveInterval = setInterval(() => {
      if (draft && draft.trim()) {
        saveDraft(draft, replyMode, replyRecipients);
      }
    }, AUTO_SAVE_INTERVAL_MS);

    return () => {
      clearInterval(autoSaveInterval);
    };
  }, [showReplyComposer, email?.threadId, draft, replyMode, replyRecipients, saveDraft]);

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
