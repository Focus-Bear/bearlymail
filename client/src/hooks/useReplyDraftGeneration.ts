import { MutableRefObject, useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { sanitizeAndProcessHtml } from 'utils/emailBodyUtils';
import { plainTextToHtml } from 'utils/emailUtils';

import { API_URL } from 'config/api';
import { STRING_STALE } from 'constants/strings';

const CUSTOM_ONLY_OPTIONS = [{ label: 'Custom', text: '' }];

interface ResolveGeneratedOptionsParams {
  email: { id: string; emailThreadId?: string; from: string; fromName?: string; subject: string; body: string };
  currentEmailId: string;
  currentGenerationEmailIdRef: MutableRefObject<string | null>;
  controller: AbortController;
  fetchPreGenerated: (threadId: string, signal: AbortSignal) => Promise<any>;
  generateOnDemand: (emailArg: any, signal: AbortSignal) => Promise<any>;
  setIsGeneratingInBackground: (active: boolean) => void;
}

// Pure helper: fetches pre-generated or on-demand reply options, returns null on stale/abort.
async function resolveGeneratedOptions({
  email,
  currentEmailId,
  currentGenerationEmailIdRef,
  controller,
  fetchPreGenerated,
  generateOnDemand,
  setIsGeneratingInBackground,
}: ResolveGeneratedOptionsParams): Promise<Array<{ label: string; text: string }> | null | 'stale'> {
  let generatedOptions: Array<{ label: string; text: string }> | null = null;

  if (email.emailThreadId) {
    const preGenerated = await fetchPreGenerated(email.emailThreadId, controller.signal);
    if (currentGenerationEmailIdRef.current !== currentEmailId || controller.signal.aborted) {
      return 'stale';
    }
    if (preGenerated) {
      if (preGenerated.isGenerating) {
        setIsGeneratingInBackground(true);
      }
      if (preGenerated.options?.length > 0) {
        generatedOptions = preGenerated.options;
      }
    }
  }

  if (!generatedOptions) {
    if (currentGenerationEmailIdRef.current !== currentEmailId || controller.signal.aborted) {
      return 'stale';
    }
    generatedOptions = await generateOnDemand(email, controller.signal);
  }

  return generatedOptions;
}

// Pure helper: converts raw options to HTML and applies them to state.
function applyGeneratedOptions(
  generatedOptions: Array<{ label: string; text: string }> | null,
  setReplyOptions: (opts: Array<{ label: string; text: string }>) => void,
  setSelectedReplyOption: (i: number) => void
): void {
  if (generatedOptions && generatedOptions.length > 0) {
    const htmlOptions = generatedOptions.map(opt => ({
      ...opt,
      text: sanitizeAndProcessHtml(plainTextToHtml(opt.text)),
    }));
    setReplyOptions([{ label: 'Custom', text: '' }, ...htmlOptions]);
  } else {
    setReplyOptions(CUSTOM_ONLY_OPTIONS);
  }
  setSelectedReplyOption(0);
}

interface Email {
  id: string;
  emailThreadId?: string;
  from: string;
  fromName?: string;
  subject: string;
  body: string;
}

interface UseReplyDraftGenerationOptions {
  autoGenerate?: boolean;
}

interface SuggestedReplyResponse {
  options: Array<{ label: string; text: string }>;
  isGenerating: boolean;
  lastEmailId: string | null;
}

export interface ReplyGenerationDebugInfo {
  propEmailId: string;
  emailObjectId: string | null;
  emailThreadId: string | null;
  threadIdUsedForFetch: string | null;
  lastGeneratedForEmailId: string | null;
  timestamp: string;
}

async function fetchPreGeneratedRepliesImpl(
  threadId: string,
  signal?: AbortSignal
): Promise<SuggestedReplyResponse | null> {
  try {
    const response = await axios.get(`${API_URL}/suggested-replies/${threadId}`, { signal });
    return response.data;
  } catch {
    return null;
  }
}

async function generateRepliesOnDemandImpl(
  currentEmail: Email,
  signal?: AbortSignal
): Promise<Array<{ label: string; text: string }> | null> {
  try {
    const response = await axios.post(
      `${API_URL}/llm/suggest-replies`,
      {
        originalEmail: {
          from: currentEmail.from,
          fromName: currentEmail.fromName,
          subject: currentEmail.subject,
          body: currentEmail.body,
        },
      },
      { signal }
    );
    if (response.data && Array.isArray(response.data) && response.data.length > 0) {
      return response.data;
    }
    return null;
  } catch {
    return null;
  }
}

export function useReplyDraftGeneration(
  emailId: string,
  email: Email | null,
  options: UseReplyDraftGenerationOptions = {}
) {
  const { autoGenerate = false } = options;
  const [replyOptions, setReplyOptions] = useState<Array<{ label: string; text: string }> | null>(null);
  const [selectedReplyOption, setSelectedReplyOption] = useState<number>(0);
  const [draft, setDraft] = useState<string | null>(null);
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [isGeneratingInBackground, setIsGeneratingInBackground] = useState(false);
  const [debugInfo, setDebugInfo] = useState<ReplyGenerationDebugInfo | null>(null);
  const lastGeneratedEmailId = useRef<string | null>(null);
  const currentGenerationEmailIdRef = useRef<string | null>(null);
  const previousEmailIdRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const threadIdUsedForFetchRef = useRef<string | null>(null);

  useEffect(() => {
    if (previousEmailIdRef.current !== null && previousEmailIdRef.current !== emailId) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      currentGenerationEmailIdRef.current = null;
      threadIdUsedForFetchRef.current = null;
      setReplyOptions(null);
      setDraft(null);
      setSelectedReplyOption(0);
      setLoadingReplies(false);
      setIsGeneratingInBackground(false);
      setDebugInfo(null);
    }
    previousEmailIdRef.current = emailId;
  }, [emailId]);

  const fetchPreGeneratedReplies = useCallback(fetchPreGeneratedRepliesImpl, []);
  const generateRepliesOnDemand = useCallback(generateRepliesOnDemandImpl, []);

  const handleGenerateDraft = useCallback(async () => {
    if (!emailId || !email) {
      return;
    }

    // Ensure email data matches the current ID to prevent using stale data
    // This can happen when switching threads - emailId updates before email state
    if (email.id !== emailId) {
      console.warn('[ReplyDraftGeneration] Skipping generation - email.id mismatch', {
        propEmailId: emailId,
        emailObjectId: email.id,
      });
      return;
    }

    // Cancel any pending request before starting a new one
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const currentEmailId = emailId;
    currentGenerationEmailIdRef.current = currentEmailId;
    threadIdUsedForFetchRef.current = email.emailThreadId || null;

    setDebugInfo({
      propEmailId: emailId,
      emailObjectId: email.id,
      emailThreadId: email.emailThreadId || null,
      threadIdUsedForFetch: email.emailThreadId || null,
      lastGeneratedForEmailId: lastGeneratedEmailId.current,
      timestamp: new Date().toISOString(),
    });

    setLoadingReplies(true);

    try {
      const result = await resolveGeneratedOptions({
        email,
        currentEmailId,
        currentGenerationEmailIdRef,
        controller,
        fetchPreGenerated: fetchPreGeneratedReplies,
        generateOnDemand: generateRepliesOnDemand,
        setIsGeneratingInBackground,
      });
      if (result === STRING_STALE || currentGenerationEmailIdRef.current !== currentEmailId) {
        return;
      }
      applyGeneratedOptions(result, setReplyOptions, setSelectedReplyOption);
      lastGeneratedEmailId.current = emailId;
    } catch (error) {
      if (currentGenerationEmailIdRef.current !== currentEmailId) {
        return;
      }
      console.error('Error generating draft:', error);
      applyGeneratedOptions(null, setReplyOptions, setSelectedReplyOption);
    } finally {
      if (currentGenerationEmailIdRef.current === currentEmailId) {
        setLoadingReplies(false);
        setIsGeneratingInBackground(false);
      }
    }
  }, [emailId, email, fetchPreGeneratedReplies, generateRepliesOnDemand]);

  useEffect(() => {
    if (autoGenerate && emailId && email && lastGeneratedEmailId.current !== emailId) {
      handleGenerateDraft();
    }
  }, [autoGenerate, emailId, email, handleGenerateDraft]);

  return {
    replyOptions,
    selectedReplyOption,
    draft,
    loadingReplies,
    isGeneratingInBackground,
    debugInfo,
    setReplyOptions,
    setDraft,
    setSelectedReplyOption,
    handleGenerateDraft,
  };
}
