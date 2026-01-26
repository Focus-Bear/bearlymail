import React, { useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';
import axios from 'axios';
import { useNotifications } from 'contexts/NotificationContext';
import { HTTP_UNAUTHORIZED, HTTP_FORBIDDEN } from 'constants/numbers';
import { captureEvent } from 'utils/posthog';
import { SuggestedAction } from 'components/quick-actions/QuickActionsMenu';
import { extractCleanBody, removeSignature, extractCleanHtmlBody, sanitizeAndProcessHtml } from 'utils/emailBodyUtils';
import { emailMentionsGitHub } from 'utils/githubUtils';
import { ACTION_ITEM_SOURCE_LLM, REPLY_MODE_REPLY_ALL, ANIMATION_TYPE_SEND, ANIMATION_TYPE_ARCHIVE, GITHUB_ACTION_PREFIX } from 'constants/strings';
import { TIMEOUT_800_MS } from 'constants/numbers';
import { AppDispatch } from 'store/store';
import { removeEmail, addOptimisticArchive, restoreEmail, removeOptimisticArchive } from 'store/slices/emailSlice';
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
  onArchiveComplete?: () => void;
}

export function useEmailDetailOperations(id: string | undefined, state: EmailDetailState, options: EmailDetailOperationsOptions = {}) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const emails = useSelector(selectEmails);
  const { showSuccess, showError } = useNotifications();
  const {
    email,
    setEmail,
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

  // Clear GitHub data immediately when email ID changes to prevent showing old data
  useEffect(() => {
    if (id) {
      setGithubLinks([]);
      setLoadingGithub(true);
    } else {
      setGithubLinks([]);
      setLoadingGithub(false);
    }
  }, [id, setGithubLinks, setLoadingGithub]);

  const triggerAnimation = useCallback((type: 'send' | 'archive') => {
    const animations = type === ANIMATION_TYPE_SEND 
      ? ['animate-fly-out-right', 'animate-fly-out-up'] 
      : ['animate-poof', 'animate-fly-out-right'];
    const randomAnimation = animations[Math.floor(Math.random() * animations.length)];
    setAnimationClass(randomAnimation);
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
    
    // Validate rule data
    if (!rule || !rule.howToSummarize || !rule.whenToUse) {
      console.error('Cannot use custom rule: invalid rule data', rule);
      return;
    }
    
    setIsGeneratingSummary(true);
    setSummaryType(rule.ruleId ? `custom-${rule.ruleId}` : 'custom');
    try {
      const response = await axios.post(`${API_URL}/summarize/${id}`, {
        type: 'custom',
        customPrompt: rule.howToSummarize,
      });
      
      if (response.data && response.data.summary) {
        setSummary(response.data.summary);
      } else {
        console.error('Invalid response from summarization API:', response.data);
        setSummary(null);
      }
    } catch (error: any) {
      console.error('Error summarizing with custom rule:', error);
      if (error.response) {
        console.error('API error response:', error.response.data);
      }
      setSummary(null);
      // Don't reset summaryType on error - keep the dropdown showing the selected rule
    } finally {
      setIsGeneratingSummary(false);
    }
  }, [id, setIsGeneratingSummary, setSummaryType, setSummary]);

  const handleSummarize = useCallback(async (type: string) => {
    if (!id) return;
    setIsGeneratingSummary(true);
    setSummaryType(type);
    try {
      const response = await axios.post(`${API_URL}/summarize/${id}`, { type });
      setSummary(response.data.summary);
    } catch (error) {
      console.error('Error summarizing:', error);
      setSummary(null);
    } finally {
      setIsGeneratingSummary(false);
    }
  }, [id, setIsGeneratingSummary, setSummaryType, setSummary]);

  // eslint-disable-next-line max-statements -- Email fetching logic requires extensive error handling and state management
  const fetchEmail = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/emails/${id}`);
      const emailData = response.data;
      setEmail(emailData);
      
      if (emailData.summary && !summary) {
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
  }, [id, summary, setEmail, setSummary, setGithubLinks, setLoadingGithub, setLoading]);

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
    if (email && !emailMentionsGitHub(email.subject, email.body, email.htmlBody)) {
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
  }, [id, email, setLoadingGithub, setGithubLinks, setHasGithubToken]);

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
      });
      
      // Only update state if we're still looking at the same email
      // This prevents showing suggestions from a previous email after switching
      if (draftGenerationEmailIdRef.current !== currentEmailId) {
        return;
      }
      
      if (response.data && Array.isArray(response.data) && response.data.length > 0) {
        captureEvent('reply_draft_generated', {
          email_id: id,
          draft_count: response.data.length,
        });
        const optionsWithCustom = [
          ...response.data,
          { label: 'Custom', text: '' }
        ];
        setReplyOptions(optionsWithCustom);
        setDraft(response.data[0].text);
        setSelectedReplyOption(0);
      } else {
        setReplyOptions([{ label: 'Custom', text: '' }]);
        setDraft('');
        setSelectedReplyOption(0);
      }
    } catch (error) {
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
      if (draftGenerationEmailIdRef.current === currentEmailId) {
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
    if (email) {
      if (mode === REPLY_MODE_REPLY_ALL) {
        const recipients = [email.from];
        setReplyRecipients(recipients.join(', '));
      } else {
        setReplyRecipients(email.from);
      }
    }
    // Only generate suggestions if we don't already have them (they may have been pre-generated in background)
    // Also don't clear draft if we have pre-generated suggestions
    if (!replyOptions || replyOptions.length === 0) {
      setDraft('');
      handleGenerateDraft();
    } else if (replyOptions.length > 0 && !draft) {
      // If we have suggestions but no draft selected, select the first one
      setDraft(replyOptions[0].text);
    }
  }, [id, email, draft, replyOptions, setReplyMode, setShowReplyComposer, setDraft, setToneCheckResult, setReplyRecipients, handleGenerateDraft]);

  const handleSendReply = useCallback(async (files: File[] = []) => {
    if (!id || !draft) return;
    
    // Skip tone check if dispute was already accepted
    if (!disputeResult?.accepted) {
      setCheckingTone(true);
      try {
        const toneResponse = await axios.post(`${API_URL}/llm/check-tone`, { text: draft });
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
    
    setSending(true);
    try {
      captureEvent('reply_sent', {
        email_id: id,
        reply_type: replyMode,
        draft_was_edited: false,
      });
      
      // Create FormData if files are present, otherwise use JSON
      if (files.length > 0) {
        const formData = new FormData();
        formData.append('reply', draft);
        formData.append('recipients', replyRecipients);
        formData.append('replyAll', String(replyMode === REPLY_MODE_REPLY_ALL));
        files.forEach((file) => {
          formData.append('files', file);
        });
        
        await axios.post(`${API_URL}/replies/send/${id}`, formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });
      } else {
        await axios.post(`${API_URL}/replies/send/${id}`, { 
          reply: draft,
          recipients: replyRecipients,
          replyAll: replyMode === REPLY_MODE_REPLY_ALL,
        });
      }
      
      setDraft(null);
      setShowReplyComposer(false);
      deleteDraft();
      await triggerAnimation(ANIMATION_TYPE_SEND);
      showSuccess(t('emailDetail.replySentSuccess'));
      navigate('/inbox');
    } catch (error: any) {
      console.error('Error sending reply:', error);
      showError(error.response?.data?.message || t('emailDetail.replySentError'));
    } finally {
      setSending(false);
    }
  }, [id, draft, replyMode, replyRecipients, disputeResult, triggerAnimation, t, navigate, setCheckingTone, setToneCheckResult, setSending, setDraft, setShowReplyComposer, showSuccess, showError, deleteDraft]);

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
    // ULTRA-VISIBLE DEBUG: This should ALWAYS show in console
    console.log('%c[ARCHIVE DEBUG] handleArchive called!', 'background: red; color: white; font-size: 20px;');
    console.log('%c[ARCHIVE DEBUG] Email ID:', 'background: blue; color: white; font-size: 16px;', id);
    console.log('%c[ARCHIVE DEBUG] Has onArchiveComplete:', 'background: green; color: white; font-size: 16px;', !!options.onArchiveComplete);
    
    if (!id) return;
    console.log('[EmailDetailArchive] Starting archive for emailId:', id);
    captureEvent('email_archive_clicked', { email_id: id });
    
    // Find the email in Redux store
    const emailToArchive = emails.find(e => e.id === id);
    console.log('[EmailDetailArchive] Email in Redux store:', emailToArchive ? { id: emailToArchive.id, subject: emailToArchive.subject } : 'NOT FOUND');
    console.log('[EmailDetailArchive] Total emails in Redux:', emails.length);
    if (!emailToArchive) {
      console.warn('[EmailDetailArchive] Email not found in Redux store:', id);
      // Still try to archive via API even if not in store
    }
    
    // Optimistic update - remove from list immediately and add to optimistic archive set
    if (emailToArchive) {
      console.log('[EmailDetailArchive] Dispatching removeEmail and addOptimisticArchive for:', id);
      dispatch(removeEmail(id));
      dispatch(addOptimisticArchive(id));
      console.log('[EmailDetailArchive] Optimistic update dispatched');
    }
    
    // If we have an onArchiveComplete callback (split view mode), use it instead of navigating
    if (options.onArchiveComplete) {
      console.log('[EmailDetailArchive] Split view mode - has onArchiveComplete callback');
      try {
        // Await the archive API call before calling onArchiveComplete
        // This ensures the email is archived before we try to open the next one
        console.log('[EmailDetailArchive] Calling archive API...');
        await axios.put(`${API_URL}/emails/${id}/archive`);
        console.log('[EmailDetailArchive] Archive API successful, calling onArchiveComplete');
        options.onArchiveComplete();
        console.log('[EmailDetailArchive] onArchiveComplete called');
      } catch (error) {
        console.error('[EmailDetailArchive] Error archiving email:', error);
        // Revert optimistic update on error
        if (emailToArchive) {
          console.log('[EmailDetailArchive] Reverting optimistic update due to error');
          dispatch(restoreEmail(emailToArchive));
          dispatch(removeOptimisticArchive(id));
        }
        // Still call onArchiveComplete even if archive fails, to allow navigation
        console.log('[EmailDetailArchive] Calling onArchiveComplete after error');
        options.onArchiveComplete();
      }
    } else {
      await triggerAnimation(ANIMATION_TYPE_ARCHIVE);
      navigate('/inbox');
      axios.put(`${API_URL}/emails/${id}/archive`)
        .catch((error) => {
          console.error('Error archiving email:', error);
          // Revert optimistic update on error
          if (emailToArchive) {
            dispatch(restoreEmail(emailToArchive));
            dispatch(removeOptimisticArchive(id));
          }
        });
    }
  }, [id, triggerAnimation, navigate, options, dispatch, emails]);

  const handleSnooze = useCallback(async () => {
    if (!id || !snoozeInput.trim()) return;
    const duration = snoozeInput.trim();
    captureEvent('email_snooze_confirmed', {
      email_id: id,
      snooze_input_length: duration.length,
    });
    setSnoozeInput('');
    setShowSnoozeInput(false);
    navigate('/inbox');
    axios.post(`${API_URL}/snooze/${id}`, { duration }).catch(error => {
      console.error('Error snoozing email:', error);
    });
  }, [id, snoozeInput, setSnoozeInput, setShowSnoozeInput, navigate]);

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
    await axios.put(`${API_URL}/emails/${emailId}/star-count`, { starCount }).catch(error => {
      console.error('Error setting star count:', error);
    });
    // Refresh email to get updated star count
    if (emailId === id) {
      fetchEmail();
    }
  }, [id, fetchEmail]);

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

