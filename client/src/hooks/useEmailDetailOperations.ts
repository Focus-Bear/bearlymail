import React, { useCallback, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';
import axios from 'axios';
import { useNotifications } from 'contexts/NotificationContext';
import { useAuth } from 'contexts/AuthContext';
import { HTTP_UNAUTHORIZED, HTTP_FORBIDDEN, HOURS_IN_TWO_DAYS, HOURS_PER_DAY } from 'constants/numbers';
import { captureEvent } from 'utils/posthog';
import { SuggestedAction } from 'components/quick-actions/QuickActionsMenu';
import { extractCleanBody, removeSignature, extractCleanHtmlBody, sanitizeAndProcessHtml } from 'utils/emailBodyUtils';
import { emailMentionsGitHub } from 'utils/githubUtils';
import { ACTION_ITEM_SOURCE_LLM, REPLY_MODE_REPLY_ALL, ANIMATION_TYPE_SEND, ANIMATION_TYPE_ARCHIVE, ANIMATION_TYPE_PRIORITY, GITHUB_ACTION_PREFIX } from 'constants/strings';
import { TIMEOUT_800_MS } from 'constants/numbers';
import { AppDispatch } from 'store/store';
import { removeEmail, addOptimisticArchive, restoreEmail, removeOptimisticArchive, addOptimisticSnooze, removeOptimisticSnooze } from 'store/slices/emailSlice';
import { selectEmails } from 'store/selectors/emailSelectors';
import { API_URL } from 'config/api';

interface EmailDetailState {
  email: any;
  setEmail: (email: any) => void;
  threadEmails: any[];
  setThreadEmails: (emails: any[]) => void;
  expandedThreadItems: Set<string>;
  setExpandedThreadItems: (setter: (prev: Set<string>) => Set<string>) => void;
  noteContent: string;
  setNoteContent: (content: string) => void;
  notesCollapsed: boolean;
  setNotesCollapsed: (collapsed: boolean) => void;
  summary: string | null;
  setSummary: (summary: string | null) => void;
  summaryType: string;
  setSummaryType: (type: string) => void;
  isGeneratingSummary: boolean;
  setIsGeneratingSummary: (generating: boolean) => void;
  summaryCollapsed: boolean;
  setSummaryCollapsed: (collapsed: boolean) => void;
  showRuleModal: boolean;
  setShowRuleModal: (show: boolean) => void;
  customRule: { whenToUse: string; howToSummarize: string };
  setCustomRule: (rule: { whenToUse: string; howToSummarize: string }) => void;
  customRules: Array<{ ruleId: string; whenToUse: string; howToSummarize: string }>;
  setCustomRules: (rules: Array<{ ruleId: string; whenToUse: string; howToSummarize: string }>) => void;
  actionItems: Array<{ id?: string; description: string; isCompleted: boolean; source: string }>;
  setActionItems: React.Dispatch<React.SetStateAction<Array<{ id?: string; description: string; isCompleted: boolean; source: string }>>>;
  newActionItem: string;
  setNewActionItem: (item: string) => void;
  draft: string | null;
  setDraft: (draft: string | null) => void;
  // eslint-disable-next-line no-restricted-syntax -- Type annotations must use string literal types for TypeScript
  replyOptions: Array<{ label: string; text: string }> | null;
  // eslint-disable-next-line no-restricted-syntax -- Type annotations must use string literal types for TypeScript
  setReplyOptions: (options: Array<{ label: string; text: string }> | null) => void;
  selectedReplyOption: number;
  setSelectedReplyOption: (index: number) => void;
  showReplyComposer: boolean;
  setShowReplyComposer: (show: boolean) => void;
  // eslint-disable-next-line no-restricted-syntax -- Type parameter must remain literal type for TypeScript compatibility
  replyMode: 'reply' | 'replyAll';
  // eslint-disable-next-line no-restricted-syntax -- Type parameter must remain literal type for TypeScript compatibility
  setReplyMode: (mode: 'reply' | 'replyAll') => void;
  replyRecipients: string;
  setReplyRecipients: (recipients: string) => void;
  replyCc: string;
  setReplyCc: (cc: string) => void;
  replyBcc: string;
  setReplyBcc: (bcc: string) => void;
  showCc: boolean;
  setShowCc: (show: boolean) => void;
  showBcc: boolean;
  setShowBcc: (show: boolean) => void;
  loadingReplies: boolean;
  setLoadingReplies: (loading: boolean) => void;
  sending: boolean;
  setSending: (sending: boolean) => void;
  toneCheckResult: { isOk: boolean; suggestions: string[]; revisedText?: string } | null;
  setToneCheckResult: (result: { isOk: boolean; suggestions: string[]; revisedText?: string } | null) => void;
  checkingTone: boolean;
  setCheckingTone: (checking: boolean) => void;
  disputing: boolean;
  setDisputing: (disputing: boolean) => void;
  disputeResult: { accepted: boolean; rulesToRemove: string[]; explanation: string; rulesUpdated: boolean; remainingRules: string[] } | null;
  setDisputeResult: (result: { accepted: boolean; rulesToRemove: string[]; explanation: string; rulesUpdated: boolean; remainingRules: string[] } | null) => void;
  snoozeInput: string;
  // eslint-disable-next-line no-restricted-syntax -- Type parameter must remain literal type for TypeScript compatibility
  setSnoozeInput: (input: string) => void;
  showSnoozeInput: boolean;
  setShowSnoozeInput: (show: boolean) => void;
  // eslint-disable-next-line no-restricted-syntax -- Type parameter must remain literal type for TypeScript compatibility
  priorityExplanation: any;
  setPriorityExplanation: (explanation: any) => void;
  showPriorityExplanation: boolean;
  setShowPriorityExplanation: (show: boolean) => void;
  githubLinks: any[];
  setGithubLinks: (links: any[]) => void;
  loadingGithub: boolean;
  setLoadingGithub: (loading: boolean) => void;
  hasGithubToken: boolean;
  setHasGithubToken: (hasToken: boolean) => void;
  suggestedActions: SuggestedAction[];
  setSuggestedActions: (actions: SuggestedAction[]) => void;
  loadingSuggestedActions: boolean;
  setLoadingSuggestedActions: (loading: boolean) => void;
  showQuickActionsMenu: boolean;
  setShowQuickActionsMenu: (show: boolean) => void;
  selectedAction: SuggestedAction | null;
  setSelectedAction: (action: SuggestedAction | null) => void;
  animationClass: string | null;
  setAnimationClass: (className: string | null) => void;
  loading: boolean;
  setLoading: (loading: boolean) => void;
}

// eslint-disable-next-line max-lines-per-function -- Email detail operations hook requires handling multiple email operations, state management, and API calls
interface EmailDetailOperationsOptions {
  onArchiveComplete?: (emailId: string) => void;
  onSnoozeComplete?: (emailId: string) => void;
}

export function useEmailDetailOperations(id: string | undefined, state: EmailDetailState, options: EmailDetailOperationsOptions = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const emails = useSelector(selectEmails);
  const { showSuccess, showError } = useNotifications();
  const { user } = useAuth();
    const {
      email,
      setEmail,
      threadEmails,
      setThreadEmails,
      setExpandedThreadItems,
    noteContent,
    setNoteContent,
    setNotesCollapsed,
    summary,
    setSummary,
    setSummaryType,
    setIsGeneratingSummary,
    setShowRuleModal,
    customRule,
    setCustomRule,
    setCustomRules,
    actionItems,
    setActionItems,
    newActionItem,
    setNewActionItem,
    draft,
    setDraft,
    replyOptions,
    setReplyOptions,
    setSelectedReplyOption,
    setShowReplyComposer,
    replyMode,
    setReplyMode,
    replyRecipients,
    setReplyRecipients,
    replyCc,
    setReplyCc,
    replyBcc,
    setReplyBcc,
    setShowCc,
    setShowBcc,
    setLoadingReplies,
    setSending,
    setToneCheckResult,
    setCheckingTone,
    disputeResult,
    setDisputing,
    setDisputeResult,
    snoozeInput,
    setSnoozeInput,
    setShowSnoozeInput,
    priorityExplanation,
    setPriorityExplanation,
    setShowPriorityExplanation,
    setGithubLinks,
    setLoadingGithub,
    setHasGithubToken,
    setSuggestedActions,
    setLoadingSuggestedActions,
    selectedAction,
    setSelectedAction,
    setAnimationClass,
    setLoading,
  } = state;

  // Returns the inbox path including the mode the user came from (if known)
  const getInboxPath = useCallback(() => {
    const fromMode = (location.state as { fromMode?: string } | null)?.fromMode;
    return fromMode ? `/inbox/${fromMode}` : '/inbox';
  }, [location.state]);

  const summaryAbortControllerRef = useRef<AbortController | null>(null);
  const draftAbortControllerRef = useRef<AbortController | null>(null);
  const previousIdRef = useRef<string | null>(null);
  const summaryRef = useRef<string | null>(summary);
  const emailRef = useRef<any>(email);

  summaryRef.current = summary;
  emailRef.current = email;

  useEffect(() => {
    if (previousIdRef.current !== null && previousIdRef.current !== id) {
      if (summaryAbortControllerRef.current) {
        summaryAbortControllerRef.current.abort();
        summaryAbortControllerRef.current = null;
      }
      if (draftAbortControllerRef.current) {
        draftAbortControllerRef.current.abort();
        draftAbortControllerRef.current = null;
      }
    }
    previousIdRef.current = id;
  }, [id]);

  useEffect(() => {
    if (id) {
      setGithubLinks([]);
      setLoadingGithub(true);
    } else {
      setGithubLinks([]);
      setLoadingGithub(false);
    }
  }, [id, setGithubLinks, setLoadingGithub]);

  const triggerAnimation = useCallback((type: 'send' | 'archive' | 'priority') => {
    let animClass: string;
    if (type === ANIMATION_TYPE_SEND) {
      const animations = ['animate-fly-out-right', 'animate-fly-out-up'];
      animClass = animations[Math.floor(Math.random() * animations.length)];
    } else if (type === ANIMATION_TYPE_PRIORITY) {
      animClass = 'animate-priority-out';
    } else {
      const animations = ['animate-poof', 'animate-fly-out-right'];
      animClass = animations[Math.floor(Math.random() * animations.length)];
    }
    setAnimationClass(animClass);
    return new Promise(resolve => setTimeout(resolve, TIMEOUT_800_MS));
  }, [setAnimationClass]);

  const fetchCustomRules = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/summarize/rules`);
      setCustomRules(response.data);
      return response.data;
    } catch (error) {
      console.error('Error fetching custom rules:', error);
      return [];
    }
  }, [setCustomRules]);

  const handleUseCustomRule = useCallback(async (rule: { whenToUse: string; howToSummarize: string; ruleId?: string }) => {
    if (!id) {
      console.error('Cannot use custom rule: email ID is missing');
      return;
    }

    if (!rule || !rule.howToSummarize || !rule.whenToUse) {
      console.error('Cannot use custom rule: invalid rule data', rule);
      return;
    }

    if (summaryAbortControllerRef.current) {
      summaryAbortControllerRef.current.abort();
    }
    const controller = new AbortController();
    summaryAbortControllerRef.current = controller;

    setIsGeneratingSummary(true);
    setSummaryType(rule.ruleId ? `custom-${rule.ruleId}` : 'custom');
    try {
      const response = await axios.post(`${API_URL}/summarize/${id}`, {
        type: 'custom',
        customPrompt: rule.howToSummarize,
      }, { signal: controller.signal });

      if (controller.signal.aborted) return;

      if (response.data && response.data.summary) {
        setSummary(response.data.summary);
      } else {
        console.error('Invalid response from summarization API:', response.data);
        setSummary(null);
      }
    } catch (error: any) {
      if (axios.isCancel(error)) {
        return;
      }
      console.error('Error summarizing with custom rule:', error);
      if (error.response) {
        console.error('API error response:', error.response.data);
      }
      setSummary(null);
    } finally {
      if (!controller.signal.aborted) {
        setIsGeneratingSummary(false);
      }
    }
  }, [id, setIsGeneratingSummary, setSummaryType, setSummary]);

  const handleSummarize = useCallback(async (type: string) => {
    if (!id) return;

    if (summaryAbortControllerRef.current) {
      summaryAbortControllerRef.current.abort();
    }
    const controller = new AbortController();
    summaryAbortControllerRef.current = controller;

    setIsGeneratingSummary(true);
    setSummaryType(type);
    try {
      const response = await axios.post(`${API_URL}/summarize/${id}`, { type }, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setSummary(response.data.summary);
    } catch (error) {
      if (axios.isCancel(error)) {
        return;
      }
      console.error('Error summarizing:', error);
      setSummary(null);
    } finally {
      if (!controller.signal.aborted) {
        setIsGeneratingSummary(false);
      }
    }
  }, [id, setIsGeneratingSummary, setSummaryType, setSummary]);

  // eslint-disable-next-line max-statements -- Email fetching logic requires extensive error handling and state management
  const fetchEmail = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/emails/${id}`);
      const emailData = response.data;
      setEmail(emailData);

      if (emailData.summary && !summaryRef.current) {
        setSummary(emailData.summary);
      }

      // Use cached GitHub metadata from email response if available
      // This provides immediate data display while fetchGithubInfo checks if refresh is needed
      if (emailData.githubMetadata?.links) {
        // Deduplicate links by URL before setting state
        const seen = new Set<string>();
        const uniqueLinks = emailData.githubMetadata.links.filter((link: any) => {
          const key = link.url || `${link.owner}-${link.repo}-${link.number}`;
          if (seen.has(key)) {
            return false;
          }
          seen.add(key);
          return true;
        });
        setGithubLinks(uniqueLinks);
        setLoadingGithub(false);
      } else {
        // If no cached data, show loading state
        setGithubLinks([]);
        setLoadingGithub(true);
      }

      axios.put(`${API_URL}/emails/${id}/read`).catch(err => console.error('Error marking as read:', err));
      axios.post(`${API_URL}/emails/${id}/accelerate`).catch(err =>
        console.debug('Job acceleration not available:', err.message)
      );

      return emailData;
    } catch (error) {
      console.error('Error fetching email:', error);
    } finally {
      setLoading(false);
    }
  }, [id, setEmail, setSummary, setGithubLinks, setLoadingGithub, setLoading]);

  const fetchThreadEmails = useCallback(async () => {
    if (!id) return;
    try {
      const response = await axios.get(`${API_URL}/emails/${id}/thread`);
      setThreadEmails(response.data || []);
    } catch (error) {
      console.error('Error fetching thread emails:', error);
      setThreadEmails([]);
    }
  }, [id, setThreadEmails]);

  const fetchNote = useCallback(async () => {
    if (!email?.threadId) return;
    try {
      const response = await axios.get(`${API_URL}/notes/thread/${email.threadId}`);
      if (response.data) {
        setNoteContent(response.data.content);
        setNotesCollapsed(false);
      } else {
        setNotesCollapsed(true);
      }
    } catch (error) {
      setNotesCollapsed(true);
    }
  }, [email?.threadId, setNoteContent, setNotesCollapsed]);

  const fetchDraft = useCallback(async () => {
    if (!email?.threadId) return null;
    try {
      const response = await axios.get(`${API_URL}/drafts/thread/${email.threadId}`);
      return response.data;
    } catch (error) {
      return null;
    }
  }, [email?.threadId]);

  const saveDraft = useCallback(async (content: string, mode: 'reply' | 'replyAll', recipients: string) => {
    if (!email?.threadId || !content.trim()) return;
    try {
      await axios.post(`${API_URL}/drafts/thread/${email.threadId}`, {
        content,
        replyMode: mode,
        recipients,
      });
    } catch (error) {
      console.error('Error saving draft:', error);
    }
  }, [email?.threadId]);

  const deleteDraft = useCallback(async () => {
    if (!email?.threadId) return;
    try {
      await axios.delete(`${API_URL}/drafts/thread/${email.threadId}`);
    } catch (error) {
      console.error('Error deleting draft:', error);
    }
  }, [email?.threadId]);

  const fetchActionItems = useCallback(async () => {
    if (!email?.id) return;
    try {
      const response = await axios.get(`${API_URL}/action-items?emailId=${email.id}`);
      setActionItems(response.data);
    } catch (error) {
      console.error('Error fetching action items:', error);
    }
  }, [email?.id, setActionItems]);

  // Track which email IDs we've already fetched GitHub data for
  const githubFetchedRef = useRef<string | null>(null);

  // Track current email ID for draft generation to prevent race conditions
  const draftGenerationEmailIdRef = useRef<string | null>(null);

  // Stable function that doesn't change on re-renders - uses refs for tracking
  const fetchGithubInfo = useCallback(async () => {
    if (!id) {
      return;
    }

    // Don't re-fetch if we already fetched for this email
    if (githubFetchedRef.current === id) {
      return;
    }

    // Quick keyword check - if email doesn't mention GitHub, skip fetching entirely
    const currentEmail = emailRef.current;
    if (currentEmail && !emailMentionsGitHub(currentEmail.subject, currentEmail.body, currentEmail.htmlBody)) {
      setGithubLinks([]);
      setLoadingGithub(false);
      githubFetchedRef.current = id; // Mark as processed so we don't check again
      return;
    }

    // Mark as fetched BEFORE starting the async operation
    githubFetchedRef.current = id;

    // Async fetch - doesn't block render
    try {
      const response = await axios.get(`${API_URL}/github/emails/${id}`);
      // Only update if we're still looking at the same email
      if (githubFetchedRef.current === id) {
        const links = response.data.links || [];
        const seen = new Set<string>();
        const uniqueLinks = links.filter((link: any) => {
          const key = link.url || `${link.owner}-${link.repo}-${link.number}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        setGithubLinks(uniqueLinks);
        setHasGithubToken(response.data.hasToken !== false);
      }
    } catch (error: any) {
      if (error.response?.status === HTTP_UNAUTHORIZED || error.response?.status === HTTP_FORBIDDEN) {
        setHasGithubToken(false);
      }
    } finally {
      if (githubFetchedRef.current === id) {
        setLoadingGithub(false);
      }
    }
  }, [id, setLoadingGithub, setGithubLinks, setHasGithubToken]);

  const refreshGithubInfo = useCallback(async () => {
    if (!id) return;
    setLoadingGithub(true);
    try {
      const response = await axios.post(`${API_URL}/github/emails/${id}/refresh`);
      // Deduplicate links by URL before setting state
      const links = response.data.links || [];
      const seen = new Set<string>();
      const uniqueLinks = links.filter((link: any) => {
        const key = link.url || `${link.owner}-${link.repo}-${link.number}`;
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      });
      setGithubLinks(uniqueLinks);
    } catch (error) {
      console.error('Error refreshing GitHub info:', error);
      alert('Failed to refresh GitHub status. Please try again.');
    } finally {
      setLoadingGithub(false);
    }
  }, [id, setLoadingGithub, setGithubLinks]);

  const fetchSuggestedActions = useCallback(async () => {
    if (!id) return;
    setLoadingSuggestedActions(true);
    try {
      const response = await axios.get(`${API_URL}/suggested-actions/email/${id}`);
      setSuggestedActions(response.data || []);
    } catch (error) {
      console.error('Error fetching suggested actions:', error);
      setSuggestedActions([]);
    } finally {
      setLoadingSuggestedActions(false);
    }
  }, [id, setLoadingSuggestedActions, setSuggestedActions]);

  const handleActionSelected = useCallback((action: SuggestedAction) => {
    setSelectedAction(action);
  }, [setSelectedAction]);

  const handleActionSuccess = useCallback(() => {
    if (selectedAction?.type.startsWith(GITHUB_ACTION_PREFIX)) {
      refreshGithubInfo();
    }
  }, [selectedAction, refreshGithubInfo]);

  const toggleThreadItem = useCallback((emailId: string) => {
    setExpandedThreadItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(emailId)) { newSet.delete(emailId); } else { newSet.add(emailId); }
      return newSet;
    });
  }, [setExpandedThreadItems]);

  const handleFetchPriorityExplanation = useCallback(async () => {
    if (!id) return;
    if (priorityExplanation) {
      setShowPriorityExplanation(true);
      return;
    }
    try {
      const response = await axios.get(`${API_URL}/emails/${id}/priority-explanation`);
      setPriorityExplanation(response.data);
      setShowPriorityExplanation(true);
    } catch (error) {
      console.error('Error fetching priority explanation:', error);
    }
  }, [id, priorityExplanation, setPriorityExplanation, setShowPriorityExplanation]);

  const handleExtractActions = useCallback(async () => {
    if (!id || !email?.body) return;
    captureEvent('action_items_extract_clicked', { email_id: id });
    setIsGeneratingSummary(true);
    try {
      const response = await axios.post(`${API_URL}/llm/extract-actions`, {
        emailBody: email.body,
        senderInfo: {
          from: email.from,
          fromName: email.fromName,
        },
      });
      const newItems = response.data.map((item: any) => ({
        description: item.description,
        isCompleted: false,
        source: ACTION_ITEM_SOURCE_LLM,
      }));
      await Promise.all(newItems.map((item: any) =>
        axios.post(`${API_URL}/action-items`, { ...item, emailId: email.id, emailThreadId: email.threadId })
      ));
      fetchActionItems();
    } catch (error) {
      console.error('Error extracting actions:', error);
    } finally {
      setIsGeneratingSummary(false);
    }
  }, [id, email, setIsGeneratingSummary, fetchActionItems]);

  const handleAddActionItem = useCallback(async () => {
    if (!newActionItem.trim() || !email?.id) return;
    try {
      await axios.post(`${API_URL}/action-items`, {
        description: newActionItem,
        emailId: email.id,
        emailThreadId: email.threadId,
        source: 'user',
      });
      setNewActionItem('');
      fetchActionItems();
    } catch (error) {
      console.error('Error adding action item:', error);
    }
  }, [newActionItem, email, setNewActionItem, fetchActionItems]);

  const handleToggleActionItem = useCallback(async (itemId: string, completed: boolean) => {
    try {
      setActionItems((prev) => prev.map(item => item.id === itemId ? { ...item, isCompleted: completed } : item));
      await axios.put(`${API_URL}/action-items/${itemId}`, { isCompleted: completed });
    } catch (error) {
      console.error('Error toggling action item:', error);
      fetchActionItems();
    }
  }, [setActionItems, fetchActionItems]);

  const handleDeleteActionItem = useCallback(async (itemId: string) => {
    try {
      await axios.delete(`${API_URL}/action-items/${itemId}`);
      fetchActionItems();
    } catch (error) {
      console.error('Error deleting action item:', error);
    }
  }, [fetchActionItems]);

  const handleRegenerateActionItems = useCallback(async () => {
    if (!id || !email?.body) return;
    setIsGeneratingSummary(true);
    try {
      const llmItems = actionItems.filter(item => item.source === ACTION_ITEM_SOURCE_LLM);
      await Promise.all(llmItems.map(item =>
        item.id ? axios.delete(`${API_URL}/action-items/${item.id}`) : Promise.resolve()
      ));

      const response = await axios.post(`${API_URL}/llm/extract-actions`, {
        emailBody: email.body,
        senderInfo: {
          from: email.from,
          fromName: email.fromName,
        },
      });
      const newItems = response.data.map((item: any) => ({
        description: item.description,
        isCompleted: false,
        source: ACTION_ITEM_SOURCE_LLM,
      }));
      await Promise.all(newItems.map((item: any) =>
        axios.post(`${API_URL}/action-items`, { ...item, emailId: email.id, emailThreadId: email.threadId })
      ));
      fetchActionItems();
    } catch (error) {
      console.error('Error regenerating action items:', error);
    } finally {
      setIsGeneratingSummary(false);
    }
  }, [id, email, actionItems, setIsGeneratingSummary, fetchActionItems]);

  const handleSaveNote = useCallback(async () => {
    if (!email) return;
    try {
      await axios.post(`${API_URL}/notes/thread/${email.threadId}`, { content: noteContent });
      fetchNote();
    } catch (error) {
      console.error('Error saving note:', error);
    }
  }, [email, noteContent, fetchNote]);

  const handleCreateCustomRule = useCallback(async () => {
    try {
      await axios.post(`${API_URL}/summarize/rules`, customRule);
      await fetchCustomRules();
      setShowRuleModal(false);
      if (id) {
        await handleUseCustomRule(customRule);
      }
      setCustomRule({ whenToUse: '', howToSummarize: '' });
    } catch (error) {
      console.error('Error creating rule:', error);
    }
  }, [customRule, id, fetchCustomRules, handleUseCustomRule, setShowRuleModal, setCustomRule]);

  const handleGenerateDraft = useCallback(async () => {
    if (!id || !email) return;

    // Ensure email data matches the current ID to prevent using stale data
    // This can happen when switching threads - id updates before email state
    if (email.id !== id) {
      console.warn('[handleGenerateDraft] Skipping - email.id mismatch', { emailId: email.id, propId: id });
      return;
    }

    // Cancel any pending draft generation request
    if (draftAbortControllerRef.current) {
      draftAbortControllerRef.current.abort();
    }
    const controller = new AbortController();
    draftAbortControllerRef.current = controller;

    // Track which email we're generating for to prevent race conditions
    const currentEmailId = id;
    draftGenerationEmailIdRef.current = currentEmailId;

    setLoadingReplies(true);
    try {
      const response = await axios.post(`${API_URL}/llm/suggest-replies`, {
        originalEmail: {
          from: email.from,
          fromName: email.fromName,
          subject: email.subject,
          body: email.body,
        }
      }, { signal: controller.signal });

      // Only update state if we're still looking at the same email
      // This prevents showing suggestions from a previous email after switching
      if (draftGenerationEmailIdRef.current !== currentEmailId || controller.signal.aborted) {
        return;
      }

      if (response.data && Array.isArray(response.data) && response.data.length > 0) {
        captureEvent('reply_draft_generated', {
          email_id: id,
          draft_count: response.data.length,
        });
        const optionsWithCustom = [
          { label: 'Custom', text: '' },
          ...response.data,
        ];
        setReplyOptions(optionsWithCustom);
        // Don't auto-populate draft - let user choose or start typing
        setDraft('');
        setSelectedReplyOption(0);
      } else {
        setReplyOptions([{ label: 'Custom', text: '' }]);
        setDraft('');
        setSelectedReplyOption(0);
      }
    } catch (error) {
      // Ignore cancelled requests
      if (axios.isCancel(error)) {
        return;
      }
      // Only update state if we're still looking at the same email
      if (draftGenerationEmailIdRef.current !== currentEmailId) {
        return;
      }
      console.error('Error generating draft:', error);
      setReplyOptions([{ label: 'Custom', text: '' }]);
      setDraft('');
      setSelectedReplyOption(0);
    } finally {
      // Only update loading state if we're still looking at the same email
      if (draftGenerationEmailIdRef.current === currentEmailId && !controller.signal.aborted) {
        setLoadingReplies(false);
      }
    }
  }, [id, email, setLoadingReplies, setReplyOptions, setDraft, setSelectedReplyOption]);

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
      const normalizedUserEmail = user?.email?.toLowerCase();
      // Extract plain email address from "Name <email>" or plain "email" format
      const extractEmail = (addr: string): string => {
        const match = addr.match(/<([^>]+)>/);
        return match ? match[1].toLowerCase() : addr.toLowerCase();
      };
      const isCurrentUser = (addr: string): boolean =>
        !!normalizedUserEmail && extractEmail(addr) === normalizedUserEmail;
      const isLatestFromCurrentUser = normalizedUserEmail && isCurrentUser(latestEmail.from);

      if (mode === REPLY_MODE_REPLY_ALL) {
        const recipients: string[] = [];

        if (isLatestFromCurrentUser) {
          // User sent the last email - reply to the original recipients
          if (latestEmail.to) {
            const toRecipients = latestEmail.to.split(',').map((r: string) => r.trim()).filter((r: string) => r && !isCurrentUser(r));
            recipients.push(...toRecipients);
          }
        } else {
          // Someone else sent the last email - reply to them + other recipients
          const replyToAddress = latestEmail.replyTo || latestEmail.from;
          recipients.push(replyToAddress);
          if (latestEmail.to) {
            const toRecipients = latestEmail.to.split(',').map((r: string) => r.trim()).filter((r: string) => r && !isCurrentUser(r));
            recipients.push(...toRecipients);
          }
        }

        const uniqueRecipients = [...new Set(recipients)];
        setReplyRecipients(uniqueRecipients.join(', '));
        if (latestEmail.cc) {
          // Filter out current user from CC as well
          const ccRecipients = latestEmail.cc.split(',').map((r: string) => r.trim()).filter((r: string) => r && !isCurrentUser(r));
          if (ccRecipients.length > 0) {
            setReplyCc(ccRecipients.join(', '));
            setShowCc(true);
          }
        }
      } else {
        // Regular reply
        if (isLatestFromCurrentUser) {
          // User sent the last email - reply to the recipients of that email, not to yourself
          // Try to find the correspondent from thread emails first
          const otherPersonEmail = threadEmails.find(
            (e: any) => !isCurrentUser(e.from)
          );
          if (otherPersonEmail) {
            setReplyRecipients(otherPersonEmail.from);
          } else if (latestEmail.to) {
            // Fall back to the 'to' field of the latest email
            const firstRecipient = latestEmail.to.split(',').map((r: string) => r.trim()).filter((r: string) => r && !isCurrentUser(r))[0];
            setReplyRecipients(firstRecipient || latestEmail.to);
          } else {
            setReplyRecipients(latestEmail.from);
          }
        } else {
          // Use Reply-To if present, otherwise From
          setReplyRecipients(latestEmail.replyTo || latestEmail.from);
        }
      }
    }
    // Only generate suggestions if we don't already have them (they may have been pre-generated in background)
    if (!replyOptions || replyOptions.length === 0) {
      setDraft('');
      handleGenerateDraft();
    } else {
      // If we have suggestions, start with empty draft (Custom option)
      // Don't auto-populate - let user choose or start typing
      setDraft('');
    }
  }, [id, email, threadEmails, draft, replyOptions, user?.email, setReplyMode, setShowReplyComposer, setDraft, setToneCheckResult, setReplyRecipients, setReplyCc, setReplyBcc, setShowCc, setShowBcc, handleGenerateDraft]);

  const performArchiveAfterReply = useCallback(async () => {
    if (!id) return;
    const emailToArchive = emails.find(e => e.id === id);
    // Always dispatch optimistic update so the email is hidden immediately,
    // even if the email object isn't in the Redux store (e.g. full-page view)
    dispatch(removeEmail(id));
    dispatch(addOptimisticArchive(id));

    // Navigate immediately after optimistic update for instant UI feedback
    if (options.onArchiveComplete && id) {
      options.onArchiveComplete(id);
    } else {
      navigate(getInboxPath());
    }

    // Make API call in background - revert optimistic update if it fails
    axios.put(`${API_URL}/emails/${id}/archive`).catch((error) => {
      console.error('Error archiving email after reply:', error);
      dispatch(removeOptimisticArchive(id));
      if (emailToArchive) {
        dispatch(restoreEmail(emailToArchive));
      }
    });
  }, [id, emails, dispatch, options, navigate, getInboxPath]);

  const performSnoozeAfterReply = useCallback(async (duration: string) => {
    if (!id) return;
    const emailToSnooze = emails.find(e => e.id === id);
    // Always dispatch optimistic update so the email is hidden immediately,
    // even if the email object isn't in the Redux store (e.g. full-page view)
    dispatch(removeEmail(id));
    dispatch(addOptimisticSnooze(id));

    // Navigate immediately after optimistic update for instant UI feedback
    if (options.onSnoozeComplete) {
      options.onSnoozeComplete(id);
    } else {
      navigate(getInboxPath());
    }

    // Make API call in background - revert optimistic update if it fails
    axios.post(`${API_URL}/snooze/${id}`, { duration }).catch((error) => {
      console.error('Error snoozing email after reply:', error);
      dispatch(removeOptimisticSnooze(id));
      if (emailToSnooze) {
        dispatch(restoreEmail(emailToSnooze));
      }
    });
  }, [id, emails, dispatch, options, navigate, getInboxPath]);

  const handleSendReply = useCallback(async (files: File[] = [], expectedReplyHours?: number, draftOverride?: string, scheduledSendAt?: Date) => {
    const draftToSend = draftOverride || draft;
    if (!id || !draftToSend) return;

    // Skip tone check if using revised text from tone check or dispute was already accepted
    if (!draftOverride && !disputeResult?.accepted) {
      setCheckingTone(true);
      try {
        const toneResponse = await axios.post(`${API_URL}/llm/check-tone`, { text: draftToSend });
        setToneCheckResult(toneResponse.data);

        if (!toneResponse.data.isOk) {
          setCheckingTone(false);
          return;
        }
      } catch (error) {
        console.error('Error checking tone:', error);
      } finally {
        setCheckingTone(false);
      }
    }

    captureEvent('reply_sent', {
      email_id: id,
      reply_type: replyMode,
      draft_was_edited: false,
      expected_reply_hours: expectedReplyHours,
    });

    const currentReplyRecipients = replyRecipients;
    const currentReplyCc = replyCc;
    const currentReplyBcc = replyBcc;
    const currentReplyMode = replyMode;
    const currentId = id;

    setShowReplyComposer(false);
    triggerAnimation(ANIMATION_TYPE_SEND);

    const sendReplyAsync = async () => {
      try {
        if (files.length > 0) {
          const formData = new FormData();
          formData.append('reply', draftToSend);
          formData.append('recipients', currentReplyRecipients);
          formData.append('replyAll', String(currentReplyMode === REPLY_MODE_REPLY_ALL));
          if (currentReplyCc) formData.append('cc', currentReplyCc);
          if (currentReplyBcc) formData.append('bcc', currentReplyBcc);
          if (expectedReplyHours !== undefined) formData.append('expectedReplyHours', String(expectedReplyHours));
          if (scheduledSendAt) formData.append('scheduledSendAt', scheduledSendAt.toISOString());
          files.forEach((file) => {
            formData.append('files', file);
          });

          await axios.post(`${API_URL}/replies/send/${currentId}`, formData, {
            headers: {
              'Content-Type': 'multipart/form-data',
            },
          });
        } else {
          await axios.post(`${API_URL}/replies/send/${currentId}`, {
            reply: draftToSend,
            recipients: currentReplyRecipients,
            cc: currentReplyCc || undefined,
            bcc: currentReplyBcc || undefined,
            replyAll: currentReplyMode === REPLY_MODE_REPLY_ALL,
            expectedReplyHours,
            scheduledSendAt: scheduledSendAt?.toISOString(),
          });
        }
        setDraft(null);
        deleteDraft();
        
        const successMessage = scheduledSendAt 
          ? t('emailDetail.replyScheduledSuccess')
          : t('emailDetail.replySentSuccess');
        showSuccess(successMessage);

        if (expectedReplyHours !== undefined) {
          if (expectedReplyHours === 0) {
            performArchiveAfterReply();
          } else {
            const duration = expectedReplyHours <= HOURS_IN_TWO_DAYS ? `${expectedReplyHours}h` : `${Math.round(expectedReplyHours / HOURS_PER_DAY)}d`;
            performSnoozeAfterReply(duration);
          }
        } else {
          navigate(getInboxPath());
        }
      } catch (error: any) {
        console.error('Error sending reply:', error);
        setDraft(draftToSend);
        setReplyRecipients(currentReplyRecipients);
        setReplyCc(currentReplyCc);
        setReplyBcc(currentReplyBcc);
        setShowReplyComposer(true);
        showError(error.response?.data?.message || t('emailDetail.replySentError'));
      }
    };

    sendReplyAsync();
  }, [id, draft, replyMode, replyRecipients, replyCc, replyBcc, disputeResult, triggerAnimation, t, navigate, getInboxPath, setCheckingTone, setToneCheckResult, setDraft, setShowReplyComposer, setReplyRecipients, setReplyCc, setReplyBcc, showSuccess, showError, deleteDraft, performArchiveAfterReply, performSnoozeAfterReply]);

  const disputeToneCheck = useCallback(async (emailText: string, userArgument: string) => {
    setDisputing(true);
    try {
      const response = await axios.post(`${API_URL}/llm/dispute-tone-check`, {
        emailText,
        userArgument,
      });
      setDisputeResult(response.data);
    } catch (error) {
      console.error('Error disputing tone check:', error);
    } finally {
      setDisputing(false);
    }
  }, [setDisputing, setDisputeResult]);

  const handleArchive = useCallback(async () => {
    if (!id) return;
    captureEvent('email_archive_clicked', { email_id: id });

    const emailToArchive = emails.find(e => e.id === id);

    if (emailToArchive) {
      dispatch(removeEmail(id));
      dispatch(addOptimisticArchive(id));
    }

    if (options.onArchiveComplete) {
      try {
        await axios.put(`${API_URL}/emails/${id}/archive`);
        options.onArchiveComplete(id);
      } catch (error) {
        console.error('Error archiving email:', error);
        if (emailToArchive) {
          dispatch(restoreEmail(emailToArchive));
          dispatch(removeOptimisticArchive(id));
        }
        options.onArchiveComplete(id);
      }
    } else {
      await triggerAnimation(ANIMATION_TYPE_ARCHIVE);
      navigate('/inbox');
      axios.put(`${API_URL}/emails/${id}/archive`)
        .catch((error) => {
          console.error('Error archiving email:', error);
          if (emailToArchive) {
            dispatch(restoreEmail(emailToArchive));
            dispatch(removeOptimisticArchive(id));
          }
        });
    }
  }, [id, triggerAnimation, navigate, options, dispatch, emails]);

  const handleSnooze = useCallback(async (durationOverride?: string) => {
    const duration = durationOverride || snoozeInput.trim();
    if (!id || !duration) return;
    captureEvent('email_snooze_confirmed', {
      email_id: id,
      snooze_input_length: duration.length,
    });

    const emailToSnooze = emails.find(e => e.id === id);

    if (emailToSnooze) {
      dispatch(removeEmail(id));
      dispatch(addOptimisticSnooze(id));
    }

    if (!durationOverride) {
      setSnoozeInput('');
      setShowSnoozeInput(false);
    }

    if (options.onSnoozeComplete) {
      try {
        await axios.post(`${API_URL}/snooze/${id}`, { duration });
        options.onSnoozeComplete(id);
      } catch (error) {
        console.error('Error snoozing email:', error);
        if (emailToSnooze) {
          dispatch(restoreEmail(emailToSnooze));
          dispatch(removeOptimisticSnooze(id));
        }
        options.onSnoozeComplete(id);
      }
    } else {
      navigate('/inbox');
      axios.post(`${API_URL}/snooze/${id}`, { duration }).catch(error => {
        console.error('Error snoozing email:', error);
        if (emailToSnooze) {
          dispatch(restoreEmail(emailToSnooze));
          dispatch(removeOptimisticSnooze(id));
        }
      });
    }
  }, [id, snoozeInput, setSnoozeInput, setShowSnoozeInput, navigate, options, dispatch, emails]);

  const handleDelete = useCallback(async () => {
    if (!id) return;
    captureEvent('email_delete_clicked', { email_id: id });
    await triggerAnimation(ANIMATION_TYPE_ARCHIVE);
    navigate('/inbox');
    axios.delete(`${API_URL}/emails/${id}`).catch(error => {
      console.error('Error deleting email:', error);
    });
  }, [id, triggerAnimation, navigate]);

  const handleSetStarCount = useCallback(async (emailId: string, starCount: number) => {
    captureEvent('email_star_count_changed', { email_id: emailId, star_count: starCount });

    const currentStarCount = (emailRef.current as any)?.starCount ?? 0;
    const isTriageToAction = currentStarCount === 0 && starCount > 0;

    await axios.put(`${API_URL}/emails/${emailId}/star-count`, { starCount }).catch(error => {
      console.error('Error setting star count:', error);
    });

    // In standalone full-page view (not split view), moving from triage to action:
    // show priority animation then navigate back to inbox
    if (isTriageToAction && !options.onArchiveComplete) {
      await triggerAnimation(ANIMATION_TYPE_PRIORITY);
      navigate('/inbox');
      return;
    }

    // Refresh email to get updated star count
    if (emailId === id) {
      fetchEmail();
    }
  }, [id, fetchEmail, options, triggerAnimation, navigate]);

  const handleBlockSender = useCallback(async (emailId: string) => {
    if (!email) return;
    captureEvent('email_block_sender_clicked', { email_id: emailId });
    try {
      await axios.post(`${API_URL}/emails/${emailId}/block-sender`);
      await triggerAnimation(ANIMATION_TYPE_ARCHIVE);
      navigate('/inbox');
    } catch (error) {
      console.error('Error blocking sender:', error);
    }
  }, [email, triggerAnimation, navigate]);

  const handleRespondToInvitation = useCallback(async (emailId: string, response: 'accepted' | 'declined' | 'tentative') => {
    if (!emailId) return;
    captureEvent('calendar_invitation_responded', { email_id: emailId, response });
    try {
      await axios.post(`${API_URL}/calendar/invitation/${emailId}/respond`, { response });
      return Promise.resolve();
    } catch (error: any) {
      console.error('Error responding to calendar invitation:', error);
      throw new Error(error.response?.data?.message || 'Failed to respond to invitation');
    }
  }, []);

  // Export helper functions for use in component
  return {
    triggerAnimation,
    fetchCustomRules,
    handleUseCustomRule,
    handleSummarize,
    fetchEmail,
    fetchThreadEmails,
    fetchNote,
    fetchDraft,
    saveDraft,
    deleteDraft,
    fetchActionItems,
    fetchGithubInfo,
    refreshGithubInfo,
    fetchSuggestedActions,
    handleActionSelected,
    handleActionSuccess,
    toggleThreadItem,
    handleFetchPriorityExplanation,
    handleExtractActions,
    handleAddActionItem,
    handleToggleActionItem,
    handleDeleteActionItem,
    handleRegenerateActionItems,
    handleSaveNote,
    handleCreateCustomRule,
    handleOpenReplyComposer,
    handleGenerateDraft,
    handleSendReply,
    disputeToneCheck,
    handleArchive,
    handleSnooze,
    handleDelete,
    handleSetStarCount,
    handleBlockSender,
    handleRespondToInvitation,
    // Helper functions
    extractCleanBody,
    removeSignature,
    extractCleanHtmlBody,
    sanitizeAndProcessHtml,
  };
}

