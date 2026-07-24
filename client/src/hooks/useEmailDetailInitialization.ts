import { MutableRefObject, useEffect, useRef } from 'react';
import axios from 'axios';
import { Email, PriorityExplanation, SummaryDebugInfo } from 'types/email';

import { API_URL } from 'config/api';
import { SUMMARY_SOURCE_DETERMINISTIC, SUMMARY_TYPE_TLDR } from 'constants/strings';
import { SummarizationRule } from 'hooks/settings/useSummarizationRules';

// A deterministic summary is a cheap text placeholder written for low-priority
// threads. Opening the email should still compute the real LLM summary while the
// placeholder stays visible, so we treat it like "needs summarising" on open.
function isDeterministicPlaceholder(emailData: Email | null): boolean {
  return Boolean(emailData?.summary && emailData.summarySource === SUMMARY_SOURCE_DETERMINISTIC);
}

// Pure helper: applies the best-matching summarization rule (or fallback) for an email.
function applyMatchedRule(options: {
  matchedRule: SummarizationRule | null;
  rulesList: SummarizationRule[];
  id: string;
  initializedRef: MutableRefObject<string | null>;
  handleUseCustomRule: (rule: SummarizationRule) => void;
  handleSummarize: (type: string) => void;
}): void {
  const { matchedRule, rulesList, id, initializedRef, handleUseCustomRule, handleSummarize } = options;
  const validRule = (rule: SummarizationRule | null) => rule?.ruleId && rule?.whenToUse && rule?.howToSummarize;
  const ruleToApply = validRule(matchedRule) ? matchedRule : rulesList.find(validRule);
  initializedRef.current = id;
  if (ruleToApply) {
    handleUseCustomRule(ruleToApply);
  } else {
    handleSummarize('tldr');
  }
}

interface UseEmailDetailInitializationProps {
  id: string | undefined;
  email: Email | null;
  isGeneratingSummary: boolean;
  summaryType: string;
  summary: string | null;
  fetchCustomRules: () => Promise<SummarizationRule[]>;
  fetchEmail: () => Promise<Email | null>;
  fetchGithubInfo: () => Promise<void>;
  fetchSuggestedActions: () => Promise<void>;
  fetchNote: () => Promise<void>;
  fetchThreadEmails: () => Promise<void>;
  /** Auto-loads the priority breakdown so the chip's click-popup shows it instantly (no spinner). */
  loadPriorityExplanation: () => Promise<void>;
  handleUseCustomRule: (rule: SummarizationRule) => Promise<void>;
  handleSummarize: (type: string) => Promise<void>;
  setSummary: (summary: string | null) => void;
  setSummaryType: (type: string) => void;
  setSummaryDebug: (debug: SummaryDebugInfo | null) => void;
  setSummaryCollapsed: (collapsed: boolean) => void;
  setActionItems: (items: Array<{ id?: string; description: string; isCompleted: boolean; source: string }>) => void;
  setExpandedThreadItems: (items: Set<string>) => void;
  setThreadEmails: (emails: Email[]) => void;
  setPriorityExplanation: (explanation: PriorityExplanation | null) => void;
  setLoading: (loading: boolean) => void;
  setEmail: (email: Email | null) => void;
  threadEmails: Email[];
  actionItems: Array<{ id?: string; description: string; isCompleted: boolean; source: string }>;
}

// Sub-hook: fetches thread-level data (note, thread emails, action items) when the email's
// thread changes. Manages its own fetch-guard ref so it only fires once per thread.
function useEmailThreadFetcher({
  email,
  fetchNote,
  fetchThreadEmails,
  setActionItems,
}: {
  email: Email | null;
  fetchNote: () => Promise<void>;
  fetchThreadEmails: () => Promise<void>;
  setActionItems: (items: Array<{ id?: string; description: string; isCompleted: boolean; source: string }>) => void;
}) {
  const fetchedThreadIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Only fetch if we have a threadId and haven't already fetched for this thread
    if (!email?.threadId || fetchedThreadIdRef.current === email.threadId) {
      return;
    }

    // Mark as fetched immediately to prevent duplicate calls
    fetchedThreadIdRef.current = email.threadId;

    fetchNote();
    fetchThreadEmails();
    const fetchAndAutoExtract = async () => {
      try {
        // Fetch action items for the thread (not just this email)
        const response = await axios.get(`${API_URL}/action-items?emailId=${email.id}`);
        setActionItems(response.data);

        // Store response for later use in the threadEmails effect
        if (response.data.length === 0 && email.body) {
          // Will be handled in the threadEmails effect below
        }
      } catch (error) {
        console.error('Error fetching action items:', error);
      }
    };
    fetchAndAutoExtract();
  }, [
    email?.threadId,
    email?.id,
    email?.body,
    email?.from,
    email?.fromName,
    fetchNote,
    fetchThreadEmails,
    setActionItems,
  ]);
}

export const useEmailDetailInitialization = ({
  id,
  email,
  isGeneratingSummary,
  summaryType,
  summary,
  fetchCustomRules,
  fetchEmail,
  fetchGithubInfo,
  fetchSuggestedActions,
  fetchNote,
  fetchThreadEmails,
  loadPriorityExplanation,
  handleUseCustomRule,
  handleSummarize,
  setSummary,
  setSummaryType,
  setSummaryDebug,
  setSummaryCollapsed,
  setActionItems,
  setExpandedThreadItems,
  setThreadEmails,
  setPriorityExplanation,
  setLoading,
  setEmail,
  threadEmails,
  actionItems,
}: UseEmailDetailInitializationProps) => {
  // Track which email ID we've initialized to prevent re-initialization
  const initializedEmailIdRef = useRef<string | null>(null);
  const previousEmailIdRef = useRef<string | undefined>(undefined);
  // Track which email ID we've fetched data for
  const fetchedEmailIdRef = useRef<string | null>(null);
  // Track which thread items have been expanded and which email auto-extracted actions
  const expandedItemsSetRef = useRef<string | null>(null);
  const autoExtractedRef = useRef<string | null>(null);

  // Clear summary and reset state when email ID changes to prevent showing old data
  useEffect(() => {
    if (id && id !== previousEmailIdRef.current) {
      // Email ID changed, show loading state and clear all stale data
      setLoading(true);
      setEmail(null); // Clear email to show loading spinner
      setSummary(null);
      setSummaryType(SUMMARY_TYPE_TLDR); // Reset to default type
      setSummaryDebug(null); // Clear admin debug so it never leaks across emails
      setThreadEmails([]); // Clear thread emails to prevent showing stale content
      setExpandedThreadItems(new Set()); // Clear expanded state
      setActionItems([]); // Clear action items
      setPriorityExplanation(null); // Clear stale priority breakdown so the chip popup reloads
      // Reset initialization and fetch tracking for the new email
      initializedEmailIdRef.current = null;
      fetchedEmailIdRef.current = null;
      expandedItemsSetRef.current = null;
      autoExtractedRef.current = null;
      previousEmailIdRef.current = id;
    }
  }, [id, setSummary, setSummaryType, setSummaryDebug, setThreadEmails, setExpandedThreadItems, setActionItems, setPriorityExplanation, setLoading, setEmail]);

  // Track manual summaryType changes
  useEffect(() => {
    if (id && summaryType !== SUMMARY_TYPE_TLDR && initializedEmailIdRef.current !== id) {
      // User has manually selected a different summary type for the current email, mark as initialized
      initializedEmailIdRef.current = id;
    }
  }, [id, summaryType]);

  // Ref-based callback pattern: gives always-fresh closure access to all deps without
  // making them reactive. (useEffectEvent does not exist in React 19.2 stable.)
  const onEmailFetchRef = useRef<(emailId: string) => Promise<void>>(async () => {});
  onEmailFetchRef.current = async (emailId: string) => {
    fetchedEmailIdRef.current = emailId;
    await initializeEmailSummary({
      id: emailId,
      isGeneratingSummary,
      summaryType,
      summary,
      fetchCustomRules,
      fetchEmail,
      handleUseCustomRule,
      handleSummarize,
      setSummary,
      setSummaryType,
      setSummaryCollapsed,
      initializedEmailIdRef,
    });
    if (fetchedEmailIdRef.current !== emailId) {
      return;
    }
    fetchGithubInfo();
    fetchSuggestedActions();
    // Auto-load the priority breakdown so the chip's click-popup opens with the
    // score + dimensions ready (no spinner); guarded inside the callback.
    void loadPriorityExplanation();
  };

  useEffect(() => {
    if (!id || fetchedEmailIdRef.current === id) {
      return;
    }
    void onEmailFetchRef.current(id);
  }, [id]);

  useEmailThreadFetcher({ email, fetchNote, fetchThreadEmails, setActionItems });

  useThreadEmailsInit({
    threadEmails,
    email,
    actionItems,
    expandedItemsSetRef,
    autoExtractedRef,
    setExpandedThreadItems,
    setActionItems,
  });
};

function useThreadEmailsInit({
  threadEmails,
  email,
  actionItems,
  expandedItemsSetRef,
  autoExtractedRef,
  setExpandedThreadItems,
  setActionItems,
}: {
  threadEmails: Email[];
  email: Email | null;
  actionItems: Array<{ id?: string; description: string; isCompleted: boolean; source: string }>;
  expandedItemsSetRef: MutableRefObject<string | null>;
  autoExtractedRef: MutableRefObject<string | null>;
  setExpandedThreadItems: (items: Set<string>) => void;
  setActionItems: (items: Array<{ id?: string; description: string; isCompleted: boolean; source: string }>) => void;
}): void {
  useEffect(() => {
    if (threadEmails.length === 0) {
      return;
    }

    const mostRecentId = threadEmails[0]?.id;
    if (mostRecentId && expandedItemsSetRef.current !== mostRecentId) {
      expandedItemsSetRef.current = mostRecentId;
      setExpandedThreadItems(new Set([mostRecentId]));
    }

    const latestEmailInThread = threadEmails[0];
    const isLatestEmail = latestEmailInThread && latestEmailInThread.id === email?.id;

    if (isLatestEmail && email?.body && actionItems.length === 0 && autoExtractedRef.current !== email.id) {
      autoExtractedRef.current = email.id;
      autoExtractActions(email, setActionItems, actionItems);
    }
  }, [threadEmails, setExpandedThreadItems, email, actionItems, setActionItems, expandedItemsSetRef, autoExtractedRef]);
}

async function autoExtractActions(
  email: Email,
  setActionItems: (items: Array<{ id?: string; description: string; isCompleted: boolean; source: string }>) => void,
  existingActions: Array<{ id?: string; description: string; isCompleted: boolean; source: string }> = []
) {
  try {
    const extractResponse = await axios.post(`${API_URL}/llm/extract-actions`, {
      emailBody: email.body,
      subject: email.subject,
      senderInfo: { from: email.from, fromName: email.fromName },
      existingActions: existingActions.map(item => item.description).filter(Boolean),
      // Bug fix: old code used `any` and accessed `labelIds`, but the server populates `labels` on the Email object (not `labelIds`)
      isSentEmail: email.labels?.includes('SENT') ?? false,
    });
    if (extractResponse.data && extractResponse.data.length > 0) {
      const newItems: Array<{ description: string; isCompleted: boolean; source: string }> = extractResponse.data.map(
        (item: { description: string; source?: string }) => ({
          description: item.description,
          isCompleted: false,
          source: 'llm',
        })
      );
      await Promise.all(
        newItems.map(item =>
          axios.post(`${API_URL}/action-items`, { ...item, emailId: email.id, emailThreadId: email.threadId })
        )
      );
      const updatedResponse = await axios.get(`${API_URL}/action-items?emailId=${email.id}`);
      setActionItems(updatedResponse.data);
    }
  } catch (extractError) {
    console.error('Error auto-extracting actions:', extractError);
  }
}

async function initializeEmailSummary({
  id,
  isGeneratingSummary,
  summaryType,
  summary,
  fetchCustomRules,
  fetchEmail,
  handleUseCustomRule,
  handleSummarize,
  setSummary,
  setSummaryType,
  setSummaryCollapsed,
  initializedEmailIdRef,
}: {
  id: string;
  isGeneratingSummary: boolean;
  summaryType: string;
  summary: string | null;
  fetchCustomRules: () => Promise<SummarizationRule[]>;
  fetchEmail: () => Promise<Email | null>;
  handleUseCustomRule: (rule: SummarizationRule) => Promise<void>;
  handleSummarize: (type: string) => Promise<void>;
  setSummary: (s: string | null) => void;
  setSummaryType: (t: string) => void;
  setSummaryCollapsed: (c: boolean) => void;
  initializedEmailIdRef: MutableRefObject<string | null>;
}) {
  const rules = await fetchCustomRules();
  const emailData = await fetchEmail();

  const hasDeterministicPlaceholder = isDeterministicPlaceholder(emailData);

  const shouldAutoSelect =
    initializedEmailIdRef.current !== id &&
    emailData &&
    (!emailData.summary || hasDeterministicPlaceholder) &&
    !emailData.isProcessingSummary &&
    !isGeneratingSummary &&
    !summary &&
    summaryType === SUMMARY_TYPE_TLDR;

  if (shouldAutoSelect) {
    // Show the deterministic placeholder immediately so it stays visible while
    // the LLM summary is generated; handleSummarize will replace it when ready.
    if (hasDeterministicPlaceholder && emailData) {
      setSummary(emailData.summary ?? null);
    }
    const rulesList = rules || [];
    if (rulesList.length > 0) {
      try {
        const response = await axios.post(`${API_URL}/summarize/match-rule/${id}`);
        applyMatchedRule({
          matchedRule: response.data?.rule,
          rulesList,
          id,
          initializedRef: initializedEmailIdRef,
          handleUseCustomRule,
          handleSummarize,
        });
      } catch (error) {
        console.error('Error matching rule:', error);
        applyMatchedRule({
          matchedRule: null,
          rulesList,
          id,
          initializedRef: initializedEmailIdRef,
          handleUseCustomRule,
          handleSummarize,
        });
      }
    } else {
      initializedEmailIdRef.current = id;
      handleSummarize(SUMMARY_TYPE_TLDR);
    }
  } else if (emailData?.summary && !summary) {
    setSummary(emailData.summary);
    setSummaryType(SUMMARY_TYPE_TLDR);
    setSummaryCollapsed(false);
    initializedEmailIdRef.current = id;
  }
}
