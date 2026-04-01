import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Email, GitHubLink } from 'types/email';
import { extractCleanBody, extractCleanBodyWithMeta, extractCleanHtmlBody, extractCleanHtmlBodyWithMeta, removeSignature, sanitizeAndProcessHtml } from 'utils/emailBodyUtils';
import { getAxiosErrorMessage } from 'utils/errors';
import { emailMentionsGitHub } from 'utils/githubUtils';
import { replaceBlobUrlsWithCids } from 'utils/inlineImageUtils';
import { captureEvent } from 'utils/posthog';
import { getCurrentTimeInTimezone } from 'utils/timezoneUtils';

import { SuggestedAction } from 'components/quick-actions/QuickActionsMenu';
import { API_URL } from 'config/api';
import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import { HOURS_IN_TWO_DAYS, HOURS_PER_DAY, HTTP_FORBIDDEN, HTTP_UNAUTHORIZED, MS_PER_SECOND, TIMEOUT_800_MS } from 'constants/numbers';
import {
  ACTION_ITEM_SOURCE_LLM,
  ANIMATION_TYPE_ARCHIVE,
  ANIMATION_TYPE_PRIORITY,
  ANIMATION_TYPE_SEND,
  GITHUB_ACTION_PREFIX,
  REPLY_MODE_FORWARD,
  REPLY_MODE_REPLY_ALL,
} from 'constants/strings';
import { useAuth } from 'contexts/AuthContext';
import { useNotifications } from 'contexts/NotificationContext';
import { removeEmail } from 'store/slices/emailSlice';
import { AppDispatch } from 'store/store';

import { useEmailDetailArchiveOps } from './useEmailDetailArchiveOps';
import { useEmailDetailDraftOps } from './useEmailDetailDraftOps';
import { EmailDetailOperationsOptions, EmailDetailState } from './useEmailDetailOperations.types';

export type { EmailDetailOperationsOptions, EmailDetailState };

interface SendReplyPayload {
  emailId: string;
  draft: string;
  recipients: string;
  cc: string | null;
  bcc: string | null;
  replyMode: string;
  expectedReplyHours?: number;
  scheduledSendAt?: Date;
  files: File[];
  /** Inline images keyed by their CID (from <img src="cid:…"> in the draft). */
  inlineImages?: Map<string, File>;
  /** Attachment IDs from the original email to carry through when forwarding. */
  forwardAttachmentIds?: string[];
}

function buildSendReplyFormData(payload: SendReplyPayload): FormData {
  const formData = new FormData();
  formData.append('reply', payload.draft);
  formData.append('recipients', payload.recipients);
  formData.append('replyAll', String(payload.replyMode === REPLY_MODE_REPLY_ALL));
  formData.append('isForward', String(payload.replyMode === REPLY_MODE_FORWARD));
  if (payload.cc) {
    formData.append('cc', payload.cc);
  }
  if (payload.bcc) {
    formData.append('bcc', payload.bcc);
  }
  if (payload.expectedReplyHours !== undefined) {
    formData.append('expectedReplyHours', String(payload.expectedReplyHours));
  }
  if (payload.scheduledSendAt) {
    formData.append('scheduledSendAt', payload.scheduledSendAt.toISOString());
  }
  if (payload.forwardAttachmentIds && payload.forwardAttachmentIds.length > 0) {
    formData.append('forwardAttachmentIds', JSON.stringify(payload.forwardAttachmentIds));
  }
  payload.files.forEach(file => {
    formData.append('files', file);
  });
  // Encode inline images: filename = "<cid>::::<original_filename>"
  payload.inlineImages?.forEach((file, cid) => {
    formData.append('inlineImages', file, `${cid}::::${file.name}`);
  });
  return formData;
}

async function sendReplyRequest(payload: SendReplyPayload): Promise<void> {
  const hasAttachments =
    payload.files.length > 0 || (payload.inlineImages && payload.inlineImages.size > 0);
  if (hasAttachments) {
    const formData = buildSendReplyFormData(payload);
    await axios.post(`${API_URL}/replies/send/${payload.emailId}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  } else {
    await axios.post(`${API_URL}/replies/send/${payload.emailId}`, {
      reply: payload.draft,
      recipients: payload.recipients,
      cc: payload.cc || undefined,
      bcc: payload.bcc || undefined,
      replyAll: payload.replyMode === REPLY_MODE_REPLY_ALL,
      isForward: payload.replyMode === REPLY_MODE_FORWARD,
      forwardAttachmentIds: payload.forwardAttachmentIds?.length ? payload.forwardAttachmentIds : undefined,
      expectedReplyHours: payload.expectedReplyHours,
      scheduledSendAt: payload.scheduledSendAt?.toISOString(),
    });
  }
}

interface PostSendRoutingParams {
  keepInAction?: boolean;
  expectedReplyHours?: number;
  scheduledSendAt?: Date;
  performArchiveAfterReply: () => void;
  performSnoozeAfterReply: (duration: string) => void;
  navigate: (path: string) => void;
  getInboxPath: () => string;
}

function routeAfterSend({
  keepInAction,
  expectedReplyHours,
  scheduledSendAt,
  performArchiveAfterReply,
  performSnoozeAfterReply,
  navigate,
  getInboxPath,
}: PostSendRoutingParams): void {
  if (keepInAction) {
    return;
  }
  if (expectedReplyHours !== undefined) {
    if (expectedReplyHours === 0) {
      performArchiveAfterReply();
    } else {
      const duration =
        expectedReplyHours <= HOURS_IN_TWO_DAYS
          ? `${expectedReplyHours}h`
          : `${Math.round(expectedReplyHours / HOURS_PER_DAY)}d`;
      performSnoozeAfterReply(duration);
    }
  } else {
    navigate(getInboxPath());
  }
}

export function useEmailDetailOperations(
  id: string | undefined,
  state: EmailDetailState,
  options: EmailDetailOperationsOptions = {}
) {
  const dispatch = useDispatch<AppDispatch>();
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
    setAutoSendCountdown,
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

  // Returns the inbox path including the mode and base path the user came from (if known).
  // Falls back to sessionStorage so the correct path is restored after page refreshes.
  const getInboxPath = useCallback(() => {
    const locState = location.state as { fromMode?: string; fromBasePath?: string } | null;
    const fromMode = locState?.fromMode ?? sessionStorage.getItem('bearlymail_lastInboxMode') ?? undefined;
    const fromBasePath = locState?.fromBasePath ?? sessionStorage.getItem('bearlymail_lastBasePath') ?? '/inbox';
    return fromMode ? `${fromBasePath}/${fromMode}` : fromBasePath;
  }, [location.state]);

  const summaryAbortControllerRef = useRef<AbortController | null>(null);
  const previousIdRef = useRef<string | null>(null);
  const summaryRef = useRef<string | null>(summary);
  const emailRef = useRef<Email | null>(email);
  const timezoneRef = useRef<string | undefined>(undefined);
  const lastAcceleratedRef = useRef<string | null>(null);

  useEffect(() => {
    axios
      .get(`${API_URL}/batch-schedule`)
      .then(res => {
        timezoneRef.current = res.data?.timezone ?? undefined;
      })
      .catch(() => {
        // timezone remains undefined — getCurrentTimeInTimezone will fall back to UTC
      });
  }, []);

  summaryRef.current = summary;
  emailRef.current = email;

  useEffect(() => {
    if (previousIdRef.current !== null && previousIdRef.current !== id) {
      if (summaryAbortControllerRef.current) {
        summaryAbortControllerRef.current.abort();
        summaryAbortControllerRef.current = null;
      }
      // Reset accelerate dedup guard when switching emails or closing the panel
      lastAcceleratedRef.current = null;
    }
    previousIdRef.current = id ?? null;
  }, [id]);

  useEffect(() => {
    githubFetchedRef.current = null;
    if (id) {
      setGithubLinks([]);
      setLoadingGithub(true);
    } else {
      setGithubLinks([]);
      setLoadingGithub(false);
    }
  }, [id, setGithubLinks, setLoadingGithub]);

  const triggerAnimation = useCallback(
    (type: 'send' | 'archive' | 'priority') => {
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
      return new Promise<void>(resolve => setTimeout(resolve, TIMEOUT_800_MS));
    },
    [setAnimationClass]
  );

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

  const handleUseCustomRule = useCallback(
    async (rule: { whenToUse: string; howToSummarize: string; ruleId?: string }) => {
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
        const response = await axios.post(
          `${API_URL}/summarize/${id}`,
          {
            type: 'custom',
            customPrompt: rule.howToSummarize,
          },
          { signal: controller.signal }
        );

        if (controller.signal.aborted) {
          return;
        }

        if (response.data && response.data.summary) {
          setSummary(response.data.summary);
        } else {
          console.error('Invalid response from summarization API:', response.data);
          setSummary(null);
        }
      } catch (error: unknown) {
        if (axios.isCancel(error)) {
          return;
        }
        console.error('Error summarizing with custom rule:', error);
        if (axios.isAxiosError(error) && error.response) {
          console.error('API error response:', error.response.data);
        }
        setSummary(null);
      } finally {
        if (!controller.signal.aborted) {
          setIsGeneratingSummary(false);
        }
      }
    },
    [id, setIsGeneratingSummary, setSummaryType, setSummary]
  );

  const handleSummarize = useCallback(
    async (type: string) => {
      if (!id) {
        return;
      }

      if (summaryAbortControllerRef.current) {
        summaryAbortControllerRef.current.abort();
      }
      const controller = new AbortController();
      summaryAbortControllerRef.current = controller;

      setIsGeneratingSummary(true);
      setSummaryType(type);
      try {
        const response = await axios.post(`${API_URL}/summarize/${id}`, { type }, { signal: controller.signal });
        if (controller.signal.aborted) {
          return;
        }
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
    },
    [id, setIsGeneratingSummary, setSummaryType, setSummary]
  );

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
        const uniqueLinks = emailData.githubMetadata.links.filter((link: GitHubLink) => {
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
      if (id && id !== lastAcceleratedRef.current) {
        lastAcceleratedRef.current = id;
        axios
          .post(`${API_URL}/emails/${id}/accelerate`)
          .catch(err => console.debug('Job acceleration not available:', err.message));
      }

      return emailData;
    } catch (error) {
      console.error('Error fetching email:', error);
    } finally {
      setLoading(false);
    }
  }, [id, setEmail, setSummary, setGithubLinks, setLoadingGithub, setLoading]);

  const fetchThreadEmails = useCallback(async () => {
    if (!id) {
      return;
    }
    try {
      const response = await axios.get(`${API_URL}/emails/${id}/thread`);
      setThreadEmails(response.data || []);
    } catch (error) {
      console.error('Error fetching thread emails:', error);
      setThreadEmails([]);
    }
  }, [id, setThreadEmails]);

  const fetchNote = useCallback(async () => {
    if (!email?.threadId) {
      return;
    }
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
    if (!email?.id) {
      return;
    }
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

    // Belt-and-suspenders: ensure loading spinner is visible before any async work (#1347).
    // useEmailDetailState already initialises loadingGithub=true, but this guards
    // against any future state reset between mount and fetchGithubInfo being called.
    setLoadingGithub(true);

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
        const uniqueLinks = links.filter((link: GitHubLink) => {
          const key = link.url || `${link.owner}-${link.repo}-${link.number}`;
          if (seen.has(key)) {
            return false;
          }
          seen.add(key);
          return true;
        });
        setGithubLinks(uniqueLinks);
        setHasGithubToken(response.data.hasToken !== false);
      }
    } catch (error: unknown) {
      if (axios.isAxiosError(error) && (error.response?.status === HTTP_UNAUTHORIZED || error.response?.status === HTTP_FORBIDDEN)) {
        setHasGithubToken(false);
      }
    } finally {
      if (githubFetchedRef.current === id) {
        setLoadingGithub(false);
      }
    }
  }, [id, setLoadingGithub, setGithubLinks, setHasGithubToken]);

  const refreshGithubInfo = useCallback(async () => {
    if (!id) {
      return;
    }
    setLoadingGithub(true);
    try {
      const response = await axios.post(`${API_URL}/github/emails/${id}/refresh`);
      // Deduplicate links by URL before setting state
      const links = response.data.links || [];
      const seen = new Set<string>();
      const uniqueLinks = links.filter((link: GitHubLink) => {
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
    if (!id) {
      return;
    }
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

  const handleActionSelected = useCallback(
    (action: SuggestedAction) => {
      setSelectedAction(action);
    },
    [setSelectedAction]
  );

  const handleActionSuccess = useCallback(() => {
    if (selectedAction?.type.startsWith(GITHUB_ACTION_PREFIX)) {
      refreshGithubInfo();
    }
  }, [selectedAction, refreshGithubInfo]);

  const toggleThreadItem = useCallback(
    (emailId: string) => {
      setExpandedThreadItems(prev => {
        const newSet = new Set(prev);
        if (newSet.has(emailId)) {
          newSet.delete(emailId);
        } else {
          newSet.add(emailId);
        }
        return newSet;
      });
    },
    [setExpandedThreadItems]
  );

  const handleFetchPriorityExplanation = useCallback(async () => {
    if (!id) {
      return;
    }
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
    if (!id || !email?.body) {
      return;
    }
    captureEvent(ANALYTICS_EVENTS.ACTION_ITEMS_EXTRACT_CLICKED, { email_id: id });
    setIsGeneratingSummary(true);
    try {
      const response = await axios.post(`${API_URL}/llm/extract-actions`, {
        emailBody: email.body,
        subject: email.subject,
        senderInfo: {
          from: email.from,
          fromName: email.fromName,
        },
        existingActions: actionItems.map(item => item.description).filter(Boolean),
        // Bug fix: old code used `any` and accessed `labelIds`, but the server populates `labels` on the Email object (not `labelIds`)
        isSentEmail: email.labels?.includes('SENT') ?? false,
      });
      const newItems: Array<{ description: string; isCompleted: boolean; source: string }> =
        response.data.map((item: { description: string; source?: string }) => ({
          description: item.description,
          isCompleted: false,
          source: ACTION_ITEM_SOURCE_LLM,
        }));
      await Promise.all(
        newItems.map((item) =>
          axios.post(`${API_URL}/action-items`, { ...item, emailId: email.id, emailThreadId: email.threadId })
        )
      );
      fetchActionItems();
    } catch (error) {
      console.error('Error extracting actions:', error);
    } finally {
      setIsGeneratingSummary(false);
    }
  }, [id, email, setIsGeneratingSummary, fetchActionItems]);

  const handleAddActionItem = useCallback(async () => {
    if (!newActionItem.trim() || !email?.id) {
      return;
    }
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

  const handleToggleActionItem = useCallback(
    async (itemId: string, completed: boolean) => {
      try {
        setActionItems(prev => prev.map(item => (item.id === itemId ? { ...item, isCompleted: completed } : item)));
        await axios.put(`${API_URL}/action-items/${itemId}`, { isCompleted: completed });
      } catch (error) {
        console.error('Error toggling action item:', error);
        fetchActionItems();
      }
    },
    [setActionItems, fetchActionItems]
  );

  const handleDeleteActionItem = useCallback(
    async (itemId: string) => {
      try {
        await axios.delete(`${API_URL}/action-items/${itemId}`);
        fetchActionItems();
      } catch (error) {
        console.error('Error deleting action item:', error);
      }
    },
    [fetchActionItems]
  );

  const handleRegenerateActionItems = useCallback(async () => {
    if (!id || !email?.body) {
      return;
    }
    setIsGeneratingSummary(true);
    try {
      const llmItems = actionItems.filter(item => item.source === ACTION_ITEM_SOURCE_LLM);
      await Promise.all(
        llmItems.map(item => (item.id ? axios.delete(`${API_URL}/action-items/${item.id}`) : Promise.resolve()))
      );

      const response = await axios.post(`${API_URL}/llm/extract-actions`, {
        emailBody: email.body,
        subject: email.subject,
        senderInfo: {
          from: email.from,
          fromName: email.fromName,
        },
        // Bug fix: old code used `any` and accessed `labelIds`, but the server populates `labels` on the Email object (not `labelIds`)
        isSentEmail: email.labels?.includes('SENT') ?? false,
      });
      const newItems: Array<{ description: string; isCompleted: boolean; source: string }> =
        response.data.map((item: { description: string; source?: string }) => ({
          description: item.description,
          isCompleted: false,
          source: ACTION_ITEM_SOURCE_LLM,
        }));
      await Promise.all(
        newItems.map((item) =>
          axios.post(`${API_URL}/action-items`, { ...item, emailId: email.id, emailThreadId: email.threadId })
        )
      );
      fetchActionItems();
    } catch (error) {
      console.error('Error regenerating action items:', error);
    } finally {
      setIsGeneratingSummary(false);
    }
  }, [id, email, actionItems, setIsGeneratingSummary, fetchActionItems]);

  const handleSaveNote = useCallback(async () => {
    if (!email) {
      return;
    }
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
    user?.email
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

  const handleSendReply = useCallback(
    async (sendOptions: {
      files?: File[];
      expectedReplyHours?: number;
      forwardAttachmentIds?: string[];
      draftOverride?: string;
      scheduledSendAt?: Date;
      keepInAction?: boolean;
      inlineImages?: Map<string, File>;
    } = {}) => {
      const { files = [], expectedReplyHours, forwardAttachmentIds, draftOverride, scheduledSendAt, keepInAction, inlineImages } = sendOptions;
      const rawDraft = draftOverride || draft;
      if (!id || !rawDraft) {
        return;
      }
      // Swap blob: preview URLs back to cid: references before tone-check and send.
      const draftToSend = replaceBlobUrlsWithCids(rawDraft);

      // Skip tone check if using revised text from tone check or dispute was already accepted
      if (!draftOverride && !disputeResult?.accepted) {
        setCheckingTone(true);
        try {
          const toneResponse = await axios.post(`${API_URL}/llm/check-tone`, {
            text: draftToSend,
            currentTime: getCurrentTimeInTimezone(timezoneRef.current),
            // Pass the scheduled send time so the server can suppress timing nags when
            // the user has already queued the email for a specific delivery time.
            scheduledSendAt: scheduledSendAt?.toISOString(),
          });
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

      captureEvent(ANALYTICS_EVENTS.REPLY_SENT, {
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
        const payload: SendReplyPayload = {
          emailId: currentId,
          draft: draftToSend,
          recipients: currentReplyRecipients,
          cc: currentReplyCc,
          bcc: currentReplyBcc,
          replyMode: currentReplyMode,
          expectedReplyHours,
          scheduledSendAt,
          files,
          inlineImages,
          forwardAttachmentIds,
        };
        try {
          await sendReplyRequest(payload);
          setDraft(null);
          deleteDraft();
          const successMessage = scheduledSendAt
            ? t('emailDetail.replyScheduledSuccess')
            : t('emailDetail.replySentSuccess');
          showSuccess(successMessage);
          // Optimistically remove thread from inbox list immediately after send.
          // This covers the tone-check "Use Revised Text" and dispute-accepted paths
          // where routeAfterSend calls navigate() without dispatching a list removal.
          // The archive/snooze paths call removeEmail again inside their own handlers,
          // but that is idempotent (filter on already-absent id is a no-op).
          dispatch(removeEmail(currentId));
          routeAfterSend({ keepInAction, expectedReplyHours, scheduledSendAt, performArchiveAfterReply, performSnoozeAfterReply, navigate, getInboxPath });
        } catch (error: unknown) {
          console.error('Error sending reply:', error);
          setDraft(draftToSend);
          setReplyRecipients(currentReplyRecipients);
          setReplyCc(currentReplyCc);
          setReplyBcc(currentReplyBcc);
          setShowReplyComposer(true);
          showError(getAxiosErrorMessage(error, t('emailDetail.replySentError')));
        }
      };

      sendReplyAsync();
    },
    [
      id,
      draft,
      replyMode,
      replyRecipients,
      replyCc,
      replyBcc,
      disputeResult,
      triggerAnimation,
      t,
      dispatch,
      navigate,
      getInboxPath,
      setCheckingTone,
      setToneCheckResult,
      setDraft,
      setShowReplyComposer,
      setReplyRecipients,
      setReplyCc,
      setReplyBcc,
      showSuccess,
      showError,
      deleteDraft,
      performArchiveAfterReply,
      performSnoozeAfterReply,
    ]
  );

  const AUTO_SEND_COUNTDOWN_SECONDS = 5;

  // Stable ref so the countdown useEffect never captures a stale handleSendReply
  const handleSendReplyRef = useRef<typeof handleSendReply>(handleSendReply);
  handleSendReplyRef.current = handleSendReply;

  const disputeToneCheck = useCallback(
    async (emailText: string, userArgument: string) => {
      setDisputing(true);
      try {
        const response = await axios.post(`${API_URL}/llm/dispute-tone-check`, {
          emailText,
          userArgument,
        });
        setDisputeResult(response.data);
        if (response.data?.accepted) {
          captureEvent(ANALYTICS_EVENTS.TONE_CHECK_DISPUTE_AUTO_SEND_TRIGGERED);
          setAutoSendCountdown(AUTO_SEND_COUNTDOWN_SECONDS);
        }
      } catch (error) {
        console.error('Error disputing tone check:', error);
      } finally {
        setDisputing(false);
      }
    },
    [setDisputing, setDisputeResult, setAutoSendCountdown]
  );

  const cancelAutoSend = useCallback(() => {
    captureEvent(ANALYTICS_EVENTS.TONE_CHECK_DISPUTE_AUTO_SEND_CANCELLED);
    setAutoSendCountdown(null);
  }, [setAutoSendCountdown]);

  // Tick the countdown every second; fire send when it reaches 0
  useEffect(() => {
    const autoSendCountdown = state.autoSendCountdown;
    if (autoSendCountdown === null) {
      return;
    }
    if (autoSendCountdown <= 0) {
      void handleSendReplyRef.current({});
      setAutoSendCountdown(null);
      return;
    }
    const timer = setTimeout(() => {
      setAutoSendCountdown(prev => (prev !== null ? prev - 1 : null));
    }, MS_PER_SECOND);
    return () => clearTimeout(timer);
  }, [state.autoSendCountdown, setAutoSendCountdown]);

  const handleSetStarCount = useCallback(
    async (emailId: string, starCount: number) => {
      captureEvent(ANALYTICS_EVENTS.EMAIL_STAR_COUNT_CHANGED, { email_id: emailId, star_count: starCount });

      const currentStarCount = emailRef.current?.starCount ?? 0;
      const isTriageToAction = currentStarCount === 0 && starCount > 0;

      await axios.put(`${API_URL}/emails/${emailId}/star-count`, { starCount }).catch(error => {
        console.error('Error setting star count:', error);
      });

      // In standalone full-page view (not split view), moving from triage to action:
      // show priority animation then navigate back to inbox
      if (isTriageToAction && !options.onArchiveComplete) {
        await triggerAnimation(ANIMATION_TYPE_PRIORITY);
        navigate(getInboxPath());
        return;
      }

      // Refresh email to get updated star count
      if (emailId === id) {
        fetchEmail();
      }
    },
    [id, fetchEmail, options, triggerAnimation, navigate, getInboxPath]
  );

  const handleBlockSender = useCallback(
    async (emailId: string) => {
      if (!email) {
        return;
      }
      captureEvent(ANALYTICS_EVENTS.EMAIL_BLOCK_SENDER_CLICKED, { email_id: emailId });
      try {
        await axios.post(`${API_URL}/emails/${emailId}/block-sender`);
        await triggerAnimation(ANIMATION_TYPE_ARCHIVE);
        navigate(getInboxPath());
      } catch (error) {
        console.error('Error blocking sender:', error);
      }
    },
    [email, triggerAnimation, navigate, getInboxPath]
  );

  const handleRespondToInvitation = useCallback(
    async (emailId: string, response: 'accepted' | 'declined' | 'tentative') => {
      if (!emailId) {
        return;
      }
      captureEvent(ANALYTICS_EVENTS.CALENDAR_INVITATION_RESPONDED, { email_id: emailId, response });
      try {
        await axios.post(`${API_URL}/calendar/invitation/${emailId}/respond`, { response });
        return Promise.resolve();
      } catch (error: unknown) {
        console.error('Error responding to calendar invitation:', error);
        throw new Error(getAxiosErrorMessage(error, 'Failed to respond to invitation'));
      }
    },
    []
  );

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
    cancelAutoSend,
    handleArchive,
    handleSnooze,
    handleDelete,
    handleSetStarCount,
    handleBlockSender,
    handleRespondToInvitation,
    // Helper functions
    extractCleanBody,
    extractCleanBodyWithMeta,
    removeSignature,
    extractCleanHtmlBody,
    extractCleanHtmlBodyWithMeta,
    sanitizeAndProcessHtml,
  };
}
