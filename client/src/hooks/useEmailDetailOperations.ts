import { useCallback, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

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

import { API_URL } from 'config/api';
import { EmailDetailState, EmailDetailOperationsOptions } from './useEmailDetailOperations.types';
import { useEmailDetailDraftOps } from './useEmailDetailDraftOps';
import { useEmailDetailArchiveOps } from './useEmailDetailArchiveOps';

export type { EmailDetailState, EmailDetailOperationsOptions };

// eslint-disable-next-line max-lines-per-function -- Email detail operations hook requires handling multiple email operations, state management, and API calls
export function useEmailDetailOperations(id: string | undefined, state: EmailDetailState, options: EmailDetailOperationsOptions = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
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

  // Draft and reply-composer operations extracted to sub-hook
  const draftOps = useEmailDetailDraftOps(
    id,
    {
      email,
      threadEmails,
      replyOptions,
      setReplyOptions,
      setDraft,
      setSelectedReplyOption,
      setLoadingReplies,
      setReplyMode,
      setShowReplyComposer,
      setToneCheckResult,
      setReplyRecipients,
      setReplyCc,
      setReplyBcc,
      setShowCc,
      setShowBcc,
    },
    user?.email,
  );

  const { fetchDraft, saveDraft, deleteDraft, handleGenerateDraft, handleOpenReplyComposer } = draftOps;

  // Archive, snooze and delete operations extracted to sub-hook
  const archiveOps = useEmailDetailArchiveOps({
    id,
    snoozeInput,
    setSnoozeInput,
    setShowSnoozeInput,
    options,
    getInboxPath,
    triggerAnimation,
  });

  const { performArchiveAfterReply, performSnoozeAfterReply, handleArchive, handleSnooze, handleDelete } = archiveOps;

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
