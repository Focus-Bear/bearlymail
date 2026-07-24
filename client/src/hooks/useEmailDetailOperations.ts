import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Email, GitHubLink, PriorityExplanation } from 'types/email';
import {
  extractCleanBody,
  extractCleanBodyWithMeta,
  extractCleanHtmlBody,
  extractCleanHtmlBodyWithMeta,
  removeSignature,
  sanitizeAndProcessHtml,
} from 'utils/emailBodyUtils';
import { getAxiosErrorMessage } from 'utils/errors';
import { emailMentionsGitHub } from 'utils/githubUtils';
import { replaceBlobUrlsWithCids } from 'utils/inlineImageUtils';
import { captureEvent } from 'utils/posthog';
import { getCurrentTimeInTimezone } from 'utils/timezoneUtils';

import { SuggestedAction } from 'components/quick-actions/QuickActionsMenu';
import { API_URL } from 'config/api';
import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import { HTTP_FORBIDDEN, HTTP_UNAUTHORIZED, MS_PER_SECOND, SUBJECT_PREVIEW_LENGTH, TIMEOUT_800_MS } from 'constants/numbers';
import {
  ANIMATION_TYPE_ARCHIVE,
  ANIMATION_TYPE_PRIORITY,
  ANIMATION_TYPE_SEND,
  GITHUB_ACTION_PREFIX,
} from 'constants/strings';
import { useAuth } from 'contexts/AuthContext';
import { useNotifications } from 'contexts/NotificationContext';
import { removeEmail } from 'store/slices/emailSlice';
import { AppDispatch } from 'store/store';

import { useEmailDetailActionItems } from './useEmailDetailActionItems';
import { useEmailDetailArchiveOps } from './useEmailDetailArchiveOps';
import { useEmailDetailDraftOps } from './useEmailDetailDraftOps';
import { EmailDetailOperationsOptions, EmailDetailState } from './useEmailDetailOperations.types';
import { routeAfterSend, SendReplyPayload, sendReplyRequest } from './useEmailDetailSendHelpers';

export type { EmailDetailOperationsOptions, EmailDetailState };

export function useEmailDetailOperations(
  id: string | undefined,
  state: EmailDetailState,
  options: EmailDetailOperationsOptions = {}
) {
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const { showSuccess, showError, showLoading } = useNotifications();
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
    selectedReplyOption,
    setSelectedReplyOption,
    setShowReplyComposer,
    replyMode,
    setReplyMode,
    replyTargetEmailId,
    setReplyTargetEmailId,
    replyRecipients,
    setReplyRecipients,
    replyCc,
    setReplyCc,
    replyBcc,
    setReplyBcc,
    replySubject,
    setReplySubject,
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
    setGithubLinks,
    setLoadingGithub,
    setHasGithubToken,
    setSuggestedActions,
    setLoadingSuggestedActions,
    selectedAction,
    setSelectedAction,
    setAnimationClass,
    setLoading,
    setSummaryDebug,
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
  const toneCheckAbortRef = useRef<AbortController | null>(null);
  const dismissLoadingRef = useRef<(() => void) | null>(null);
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
      setSummaryDebug(null);
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
          setSummaryDebug(response.data.summaryDebug ?? null);
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
    [id, setIsGeneratingSummary, setSummaryType, setSummary, setSummaryDebug]
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
      setSummaryDebug(null);
      try {
        const response = await axios.post(`${API_URL}/summarize/${id}`, { type }, { signal: controller.signal });
        if (controller.signal.aborted) {
          return;
        }
        setSummary(response.data.summary);
        setSummaryDebug(response.data.summaryDebug ?? null);
      } catch (error) {
        if (axios.isCancel(error)) {
          return;
        }
        console.error('Error summarizing:', error);
        setSummary(null);
        setSummaryDebug(null);
      } finally {
        if (!controller.signal.aborted) {
          setIsGeneratingSummary(false);
        }
      }
    },
    [id, setIsGeneratingSummary, setSummaryType, setSummary, setSummaryDebug]
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
        // Mark as fetched so fetchGithubInfo skips the API call and doesn't overwrite these links.
        // fetchGithubInfo runs immediately after fetchEmail (before React re-renders), so
        // emailRef.current is still the previous email — if we don't set this, fetchGithubInfo
        // will call the API and overwrite server-provided links with potentially empty results.
        // Server returning links implies a valid GitHub token, so set hasToken to avoid
        // showing the connection prompt.
        setHasGithubToken(true);
        githubFetchedRef.current = id ?? null;
        console.debug('[GitHub] fetchEmail: server returned links, marked as fetched to prevent overwrite', {
          emailId: id,
          linkCount: uniqueLinks.length,
          links: uniqueLinks.map((link: GitHubLink) => link.url),
        });
      } else {
        // If no cached data, show loading state
        setGithubLinks([]);
        setLoadingGithub(true);
        console.debug('[GitHub] fetchEmail: no server metadata, fetchGithubInfo will run', { emailId: id });
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

  const {
    fetchActionItems,
    handleExtractActions,
    handleAddActionItem,
    handleToggleActionItem,
    handleDeleteActionItem,
    handleRegenerateActionItems,
  } = useEmailDetailActionItems({
    id,
    email,
    actionItems,
    newActionItem,
    setActionItems,
    setNewActionItem,
    setIsGeneratingSummary,
  });

  // Track which email IDs we've already fetched GitHub data for
  const githubFetchedRef = useRef<string | null>(null);

  // Stable function that doesn't change on re-renders - uses refs for tracking
  const fetchGithubInfo = useCallback(async () => {
    if (!id) {
      return;
    }

    // Don't re-fetch if we already fetched (or determined no GitHub links) for this email.
    if (githubFetchedRef.current === id) {
      console.debug('[GitHub] fetchGithubInfo: already fetched, skipping', { emailId: id });
      return;
    }

    const currentEmail = emailRef.current;
    // emailIsCurrent is true when emailRef has already been updated with the email we're
    // fetching GitHub info for. When React hasn't re-rendered yet, emailRef.current may still
    // hold the previous email — using it for keyword-matching or hasCachedLinks would be wrong.
    const emailIsCurrent = currentEmail?.id === id;
    // Only trust cached links from the ref when it matches the current email ID. A stale ref
    // could give a false-negative (previous email had no links) and cause hasCachedLinks=false,
    // which would then incorrectly clear the links fetchEmail already set from server metadata.
    const hasCachedLinks = emailIsCurrent && (currentEmail?.githubMetadata?.links?.length ?? 0) > 0;

    console.debug('[GitHub] fetchGithubInfo: starting', {
      emailId: id,
      currentEmailId: currentEmail?.id,
      emailIsCurrent,
      hasCachedLinks,
      subject: currentEmail?.subject?.substring(0, SUBJECT_PREVIEW_LENGTH),
      from: currentEmail?.from,
    });

    if (!hasCachedLinks) {
      if (emailIsCurrent) {
        // Belt-and-suspenders: ensure loading spinner is visible before any async work (#1347).
        // useEmailDetailState already initialises loadingGithub=true, but this guards
        // against any future state reset between mount and fetchGithubInfo being called.
        // Skip when emailRef is stale: fetchEmail may have already shown server links and cleared
        // the loading state — resetting it here would flash a spurious spinner.
        setLoadingGithub(true);

        // Quick keyword check - if email doesn't mention GitHub, skip fetching entirely
        if (!emailMentionsGitHub(currentEmail.subject, currentEmail.body, currentEmail.htmlBody, currentEmail.from)) {
          console.debug('[GitHub] fetchGithubInfo: email does not mention GitHub, clearing links', {
            emailId: id,
            subject: currentEmail.subject?.substring(0, SUBJECT_PREVIEW_LENGTH),
            from: currentEmail?.from,
          });
          setGithubLinks([]);
          setLoadingGithub(false);
          githubFetchedRef.current = id; // Mark as processed so we don't check again
          return;
        }
      }
      // If emailRef is stale, skip the loading spinner and keyword check but still proceed to
      // the API call — the server will return the correct links for the current email ID.
    }

    // Mark as fetched BEFORE starting the async operation
    githubFetchedRef.current = id;

    // Async fetch - doesn't block render
    console.debug('[GitHub] fetchGithubInfo: calling API', { emailId: id });
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
        console.debug('[GitHub] fetchGithubInfo: API response', {
          emailId: id,
          linkCount: uniqueLinks.length,
          hasToken: response.data.hasToken,
          links: uniqueLinks.map((link: GitHubLink) => link.url),
        });
        setGithubLinks(uniqueLinks);
        setHasGithubToken(response.data.hasToken !== false);
      }
    } catch (error: unknown) {
      console.debug('[GitHub] fetchGithubInfo: API error', { emailId: id, error });
      if (
        axios.isAxiosError(error) &&
        (error.response?.status === HTTP_UNAUTHORIZED || error.response?.status === HTTP_FORBIDDEN)
      ) {
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

  // Fetches the priority breakdown into state WITHOUT opening any popover. The
  // full-page detail view auto-loads this on mount so the priority chip's
  // click-popup shows the score + breakdown instantly (no spinner). Guarded so it
  // never refetches once the explanation is present.
  const loadPriorityExplanation = useCallback(async () => {
    if (!id || priorityExplanation) {
      return;
    }
    try {
      const response = await axios.get<PriorityExplanation>(`${API_URL}/emails/${id}/priority-explanation`);
      setPriorityExplanation(response.data);
    } catch (error) {
      console.error('Error fetching priority explanation:', error);
    }
  }, [id, priorityExplanation, setPriorityExplanation]);

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
    },
    user?.email
  );

  const { fetchDraft, saveDraft, deleteDraft, handleGenerateDraft, handleOpenReplyComposer, generateFromCustomPrompt, generatingFromCustomPrompt } = draftOps;

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
     
    async (
      sendOptions: {
        files?: File[];
        expectedReplyHours?: number;
        expectedReplyDuration?: string;
        forwardAttachmentIds?: string[];
        draftOverride?: string;
        scheduledSendAt?: Date;
        keepInAction?: boolean;
        inlineImages?: Map<string, File>;
      } = {}
    ) => {
      const {
        files = [],
        expectedReplyHours,
        expectedReplyDuration,
        forwardAttachmentIds,
        draftOverride,
        scheduledSendAt,
        keepInAction,
        inlineImages,
      } = sendOptions;
      const rawDraft = draftOverride || draft;
      if (!id || !rawDraft) {
        return;
      }
      // Swap blob: preview URLs back to cid: references before tone-check and send.
      const draftToSend = replaceBlobUrlsWithCids(rawDraft);

      // Skip tone check if using revised text from tone check or dispute was already accepted
      if (!draftOverride && !disputeResult?.accepted) {
        // Cancel any in-flight tone check before starting a new one
        if (toneCheckAbortRef.current) {
          toneCheckAbortRef.current.abort();
        }
        const controller = new AbortController();
        toneCheckAbortRef.current = controller;

        setCheckingTone(true);
        // Use the same notification system as "Email sent" — it's already proven to appear.
        const dismiss = showLoading(t('toneCheck.toastChecking'));
        dismissLoadingRef.current = dismiss;
        if (controller.signal.aborted) {
          dismiss();
          if (dismissLoadingRef.current === dismiss) {
            dismissLoadingRef.current = null;
          }
          return;
        }
        try {
          const toneResponse = await axios.post(
            `${API_URL}/llm/check-tone`,
            {
              text: draftToSend,
              currentTime: getCurrentTimeInTimezone(timezoneRef.current),
              // Pass the scheduled send time so the server can suppress timing nags when
              // the user has already queued the email for a specific delivery time.
              scheduledSendAt: scheduledSendAt?.toISOString(),
            },
            { signal: controller.signal }
          );
          setToneCheckResult(toneResponse.data);

          if (!toneResponse.data.isOk) {
            setCheckingTone(false);
            return;
          }
        } catch (error) {
          if (axios.isCancel(error)) {
            // User cancelled — not an error
            return;
          }
          console.error('Error checking tone:', error);
        } finally {
          dismiss();
          if (dismissLoadingRef.current === dismiss) {
            dismissLoadingRef.current = null;
          }
          setCheckingTone(false);
          if (toneCheckAbortRef.current === controller) {
            toneCheckAbortRef.current = null;
          }
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
      const currentReplySubject = replySubject;
      const currentId = id;
      // Dispatch the reply/forward against the targeted thread message (recipients,
      // subject and forwarded attachments are all derived from it server-side). Falls
      // back to the opened message when no earlier message was explicitly chosen.
      const sendEmailId = replyTargetEmailId ?? id;

      setShowReplyComposer(false);
      triggerAnimation(ANIMATION_TYPE_SEND);

      const sendReplyAsync = async () => {
        const payload: SendReplyPayload = {
          emailId: sendEmailId,
          draft: draftToSend,
          recipients: currentReplyRecipients,
          cc: currentReplyCc,
          bcc: currentReplyBcc,
          replyMode: currentReplyMode,
          subject: currentReplySubject || undefined,
          expectedReplyHours,
          expectedReplyDuration,
          scheduledSendAt,
          files,
          inlineImages,
          forwardAttachmentIds,
          keepInAction,
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
          routeAfterSend({
            keepInAction,
            expectedReplyHours,
            expectedReplyDuration,
            scheduledSendAt,
            performArchiveAfterReply,
            performSnoozeAfterReply,
            navigate,
            getInboxPath,
          });
        } catch (error: unknown) {
          console.error('Error sending reply:', error);
          setDraft(draftToSend);
          setReplyRecipients(currentReplyRecipients);
          setReplyCc(currentReplyCc);
          setReplyBcc(currentReplyBcc);
          setReplySubject(currentReplySubject);
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
      replyTargetEmailId,
      replyRecipients,
      replyCc,
      replyBcc,
      replySubject,
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
      showLoading,
      deleteDraft,
      performArchiveAfterReply,
      performSnoozeAfterReply,
    ]
  );

  const AUTO_SEND_COUNTDOWN_SECONDS = 5;

  // Stable ref so the countdown useEffect never captures a stale handleSendReply
  const handleSendReplyRef = useRef<typeof handleSendReply>(handleSendReply);
  handleSendReplyRef.current = handleSendReply;

  // Tracks inline images, files, and forwarded attachments from ReplyComposer so the
  // auto-send countdown can include them when it fires.
  const replyInlineImagesRef = useRef<Map<string, File>>(new Map());
  const setReplyInlineImages = useCallback((images: Map<string, File>) => {
    replyInlineImagesRef.current = images;
  }, []);

  const replyFilesRef = useRef<File[]>([]);
  const setReplyFiles = useCallback((files: File[]) => {
    replyFilesRef.current = files;
  }, []);

  const replyForwardAttachmentIdsRef = useRef<string[]>([]);
  const setReplyForwardAttachmentIds = useCallback((ids: string[]) => {
    replyForwardAttachmentIdsRef.current = ids;
  }, []);

  const cancelToneCheck = useCallback(() => {
    if (toneCheckAbortRef.current) {
      toneCheckAbortRef.current.abort();
      toneCheckAbortRef.current = null;
    }
    dismissLoadingRef.current?.();
    dismissLoadingRef.current = null;
    setCheckingTone(false);
  }, [setCheckingTone]);

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
      const pendingInlineImages = replyInlineImagesRef.current.size > 0 ? replyInlineImagesRef.current : undefined;
      const pendingFiles = replyFilesRef.current.length > 0 ? replyFilesRef.current : undefined;
      const pendingForwardAttachmentIds =
        replyForwardAttachmentIdsRef.current.length > 0 ? replyForwardAttachmentIdsRef.current : undefined;
      void handleSendReplyRef.current({
        inlineImages: pendingInlineImages,
        files: pendingFiles,
        forwardAttachmentIds: pendingForwardAttachmentIds,
      });
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

      await axios.put(`${API_URL}/emails/${emailId}/star-count`, { starCount }).catch(error => {
        console.error('Error setting star count:', error);
      });

      // Refresh the email so the priority chip reflects the new level. The detail
      // view stays put when priority changes (no navigate-away to the inbox).
      if (emailId === id) {
        fetchEmail();
      }
    },
    [id, fetchEmail]
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
    loadPriorityExplanation,
    handleExtractActions,
    handleAddActionItem,
    handleToggleActionItem,
    handleDeleteActionItem,
    handleRegenerateActionItems,
    handleSaveNote,
    handleCreateCustomRule,
    handleOpenReplyComposer,
    handleGenerateDraft,
    generateFromCustomPrompt,
    generatingFromCustomPrompt,
    handleSendReply,
    setReplyInlineImages,
    setReplyFiles,
    setReplyForwardAttachmentIds,
    cancelToneCheck,
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
