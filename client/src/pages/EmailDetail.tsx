import React, { useState, useEffect, useImperativeHandle, forwardRef, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { useResponsiveBreakpoints } from 'hooks/useResponsiveBreakpoints';
import { captureEvent } from 'utils/posthog';
import { getCorrespondent, extractEmailAddress } from 'utils/emailUtils';
import { useAuth } from 'contexts/AuthContext';
import { GitHubStatusSection } from 'components/github/GitHubStatusSection';
import { CRMDealsSection } from 'components/crm/CRMDealsSection';
import { useEmailDetailState } from 'hooks/useEmailDetailState';
import { useEmailDetailOperations } from 'hooks/useEmailDetailOperations';
import { useEmailDetailInitialization } from 'hooks/useEmailDetailInitialization';
import { SummarySection } from 'components/email-detail/SummarySection';
import { PrivateNotesSection } from 'components/email-detail-inline/PrivateNotesSection';
import { ActionItemsSection } from 'components/email-detail-inline/ActionItemsSection';
import { ReplyComposer } from 'components/email-detail-inline/ReplyComposer';
import { EmailDetailAnimationOverlay } from 'components/email-detail/EmailDetailAnimationOverlay';
import { EmailDetailSidebar } from 'components/email-detail/EmailDetailSidebar';
import { EmailDetailHeader } from 'components/email-detail/EmailDetailHeader';
import { EmailPhishingWarning, shouldShowPhishingAlert } from 'components/email-detail/EmailPhishingWarning';
import { EmailDetailActions } from 'components/email-detail/EmailDetailActions';
import { EmailThreadView } from 'components/email-detail/EmailThreadView';
import { CustomRuleModal } from 'components/email-detail/CustomRuleModal';
import { TimePicker } from 'components/compose/TimePicker';
import { Email } from 'types/email';
import {
  ACTION_TYPE_CUSTOM,
  SUMMARY_TYPE_CUSTOM,
  SUMMARY_TYPE_CUSTOM_PREFIX,
  ALERT_THREAD_ID_COPIED,
  DEBUG_INFO_TITLE,
  DEBUG_LABEL_GMAIL_MESSAGE_ID,
  DEBUG_LABEL_GMAIL_THREAD_ID,
  DEBUG_LABEL_LABELS,
  DEBUG_LABEL_LABELS_COUNT,
  DEBUG_LABEL_RECEIVED_AT,
  DEBUG_LABEL_IS_READ,
  DEBUG_LABEL_IS_ARCHIVED,
  DEBUG_LABEL_STAR_COUNT,
  DEBUG_LABEL_THREAD_EMAILS,
  DEBUG_LABEL_MSG_ID,
  DEBUG_LABEL_RECEIVED,
  STRING_NA,
  STRING_COPY,
  STRING_EMPTY_ARRAY,
  EVENT_EMAIL_DETAIL_VIEWED,
  PROP_EMAIL_ID,
  STYLE_100VH,
  STRING_HIDDEN,
  STYLE_GAP_8PX,
  STYLE_PADDING_2PX_6PX,
  STYLE_PADDING_2PX_8PX,
  STYLE_FONT_SIZE_11PX,
  STYLE_RADIUS_4PX,
  STRING_TRUE_TEXT,
  STRING_FALSE_TEXT,
  STRING_RELATIVE,
  STYLE_MAX_WIDTH_900PX,
  STYLE_MARGIN_0_AUTO,
  STRING_SMOOTH,
  STRING_START,
  STRING_REPLY,
  STRING_REPLY_ALL,
  STRING_FORWARD,
  STRING_MONOSPACE,
} from 'constants/strings';
import { AUTO_SAVE_INTERVAL_MS, FONT_WEIGHT_SEMIBOLD } from 'constants/numbers';
import { useScheduledEmails } from 'hooks/useScheduledEmails';

interface EmailDetailProps {
  emailId?: string;
  compactMode?: boolean; // When true, renders without sidebar, overlay, and full-page layout for use in split view
  onArchiveComplete?: (emailId: string) => void; // Called after archive completes in split view mode
  onSnoozeComplete?: (emailId: string) => void; // Called after snooze completes in split view mode
  autoGenerateReplies?: boolean; // When true, automatically generates reply drafts when email loads
  onCorrespondentChange?: (correspondent: { name: string; email: string }) => void; // Called when correspondent info is available
}

// Methods exposed via ref for external control (e.g., from SplitViewPanel header)
export interface EmailDetailRef {
  openReplyComposer: (mode?: typeof STRING_REPLY | typeof STRING_REPLY_ALL | typeof STRING_FORWARD) => void;
  archive: () => void;
  snooze: (duration: string) => void;
  setStarCount: (count: number) => void;
  getStarCount: () => number;
}

// eslint-disable-next-line max-lines-per-function -- Email detail page requires handling multiple email operations and UI states
const EmailDetail = forwardRef<EmailDetailRef, EmailDetailProps>(({ emailId: propEmailId, compactMode = false, onArchiveComplete, onSnoozeComplete, autoGenerateReplies = false, onCorrespondentChange }, ref) => {
  const params = useParams<{ id: string }>();
  const id = propEmailId || params.id;
  const { t } = useTranslation();
  const { user } = useAuth();
  const { isMobile } = useResponsiveBreakpoints();
  const replyTextareaRef = useRef<HTMLTextAreaElement>(null);
  const replyComposerRef = useRef<HTMLDivElement>(null);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [scheduledSendAt, setScheduledSendAt] = useState<Date | null>(null);
  const [timeWarning, setTimeWarning] = useState<string | undefined>();
  const [suggestedTime, setSuggestedTime] = useState<Date | undefined>();

  const {
    timeSuggestions,
    checkSendTime,
    fetchTimeSuggestions,
  } = useScheduledEmails();

  const state = useEmailDetailState();
  const operations = useEmailDetailOperations(id, state, { onArchiveComplete, onSnoozeComplete });
  
  const {
    email,
    threadEmails,
    expandedThreadItems,
    noteContent,
    notesCollapsed,
    summary,
    summaryType,
    summaryCollapsed,
    isGeneratingSummary,
    showRuleModal,
    customRule,
    customRules,
    actionItems,
    newActionItem,
    draft,
    replyOptions,
    selectedReplyOption,
    showReplyComposer,
    replyMode,
    replyRecipients,
    replyCc,
    replyBcc,
    showCc,
    showBcc,
    loadingReplies,
    sending,
    toneCheckResult,
    checkingTone,
    disputing,
    disputeResult,
    priorityExplanation,
    showPriorityExplanation,
    githubLinks,
    loadingGithub,
    hasGithubToken,
    suggestedActions,
    showQuickActionsMenu,
    selectedAction,
    animationClass,
    loading,
    setLoading,
    setEmail,
    setThreadEmails,
    setExpandedThreadItems,
    setNoteContent,
    setNotesCollapsed,
    setSummary,
    setSummaryType,
    setSummaryCollapsed,
    setShowRuleModal,
    setCustomRule,
    setActionItems,
    setNewActionItem,
    setDraft,
    setReplyOptions,
    setSelectedReplyOption,
    setShowReplyComposer,
    setReplyRecipients,
    setReplyCc,
    setReplyBcc,
    setShowCc,
    setShowBcc,
    setToneCheckResult,
    setShowPriorityExplanation,
    setShowQuickActionsMenu,
    setSelectedAction,
    setReplyMode,
  } = state;

  const {
    fetchCustomRules,
    handleUseCustomRule,
    handleSummarize,
    fetchEmail,
    fetchThreadEmails,
    fetchNote,
    fetchDraft,
    saveDraft,
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
    extractCleanBody,
    removeSignature,
    extractCleanHtmlBody,
    sanitizeAndProcessHtml,
  } = operations;

  useEmailDetailInitialization({
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
    handleUseCustomRule,
    handleSummarize,
    setSummary,
    setSummaryType,
    setSummaryCollapsed,
    setActionItems,
    setExpandedThreadItems,
    setThreadEmails,
    setLoading,
    setEmail,
    threadEmails,
    actionItems,
  });

  // Expose methods via ref for external control (e.g., SplitViewPanel header actions)
  useImperativeHandle(ref, () => ({
    openReplyComposer: (mode: typeof STRING_REPLY | typeof STRING_REPLY_ALL | typeof STRING_FORWARD = STRING_REPLY) => {
      handleOpenReplyComposer(mode);
      // Scroll to reply composer and focus the textarea after a short delay to ensure it's mounted
      setTimeout(() => {
        replyComposerRef.current?.scrollIntoView({ behavior: STRING_SMOOTH, block: STRING_START });
        replyTextareaRef.current?.focus();
      }, 100);
    },
    archive: () => {
      handleArchive();
    },
    snooze: (duration: string) => {
      handleSnooze(duration);
    },
    setStarCount: (count: number) => {
      if (email?.id) {
        handleSetStarCount(email.id, count);
      }
    },
    getStarCount: () => {
      return (email as any)?.starCount ?? 0;
    },
  }), [handleOpenReplyComposer, handleArchive, handleSnooze, handleSetStarCount, email]);

  // Scheduling handlers
  const handleOpenTimePicker = useCallback(() => {
    fetchTimeSuggestions();
    setTimeWarning(undefined);
    setSuggestedTime(undefined);
    setShowTimePicker(true);
  }, [fetchTimeSuggestions]);

  const handleTimeSelect = useCallback(async (time: Date) => {
    const checkResult = await checkSendTime(time);
    if (!checkResult.isAppropriate) {
      setTimeWarning(checkResult.warning);
      setSuggestedTime(checkResult.suggestion ? new Date(checkResult.suggestion) : undefined);
    } else {
      setTimeWarning(undefined);
      setSuggestedTime(undefined);
      setScheduledSendAt(time);
      setShowTimePicker(false);
    }
  }, [checkSendTime]);

  const handleCancelTimePicker = useCallback(() => {
    setTimeWarning(undefined);
    setSuggestedTime(undefined);
    setShowTimePicker(false);
  }, []);

  useEffect(() => {
    if (id && email) {
      captureEvent(EVENT_EMAIL_DETAIL_VIEWED, { [PROP_EMAIL_ID]: id });
    }
  }, [id, email]);

  useEffect(() => {
    if (email && onCorrespondentChange) {
      const correspondent = getCorrespondent(email, user?.email, threadEmails);
      onCorrespondentChange({ name: correspondent.name, email: correspondent.email });
    }
  }, [email, threadEmails, user?.email, onCorrespondentChange]);

  // Track previous email ID for draft saving when switching emails
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
    const previousReplyMode = previousReplyModeRef.current;
    const previousRecipients = previousRecipientsRef.current;

    if (previousId && previousId !== id && previousThreadId && previousDraft && previousDraft.trim()) {
      saveDraft(previousDraft, previousReplyMode, previousRecipients);
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

  // Load existing draft when opening an email (but don't auto-open the composer)
  // The draft will be ready when user clicks reply
  // Use a ref to track the last loaded threadId to prevent re-loading on every render
  const lastLoadedThreadIdRef = useRef<string | null>(null);
  useEffect(() => {
    // Only load draft once per thread - prevents overwriting user's local changes
    if (email?.threadId && lastLoadedThreadIdRef.current !== email.threadId) {
      lastLoadedThreadIdRef.current = email.threadId;
      const loadDraft = async () => {
        const savedDraft = await fetchDraft();
        if (savedDraft && savedDraft.content) {
          setDraft(savedDraft.content);
          // Don't auto-open the reply composer - let user read the email first
          // The draft will be shown when user clicks reply
          if (savedDraft.replyMode) {
            setReplyMode(savedDraft.replyMode);
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
      // Use a small delay to ensure the component is fully rendered
      setTimeout(() => {
        replyComposerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, [showReplyComposer]);

  // Auto-generate reply drafts in the background when email loads (for "For Action" mode)
  // Don't auto-open the reply composer - let user read the email first
  // Suggestions will be ready when user clicks reply
  const autoGeneratedRef = useRef<string | null>(null);
  const hasDraftRef = useRef<boolean>(false);
  
  // Track if we have a saved draft to avoid generating suggestions over it
  useEffect(() => {
    hasDraftRef.current = !!(draft && draft.trim());
  }, [draft]);
  
  useEffect(() => {
    // Skip if: not in auto-generate mode, no email, already generated for this email,
    // already have reply options, or there's a saved draft
    if (autoGenerateReplies && id && email && autoGeneratedRef.current !== id && !replyOptions && !hasDraftRef.current) {
      autoGeneratedRef.current = id;
      // Generate suggestions in background without opening the composer
      handleGenerateDraft();
    }
  }, [autoGenerateReplies, id, email, replyOptions, handleGenerateDraft]);

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: STYLE_100VH,
        backgroundColor: theme.colors.background.default,
        color: theme.colors.text.secondary,
      }}>
        {t('emailDetail.loadingEmail')}
      </div>
    );
  }

  if (!email) {
    return <div>{t('emailDetail.emailNotFound')}</div>;
  }

  // Shared content that appears in both full and compact mode
  const emailContent = (
    <>
      <div style={{ marginBottom: isMobile ? theme.spacing.sm : theme.spacing.xl }}>
        <PrivateNotesSection
          noteContent={noteContent}
          notesCollapsed={notesCollapsed}
          onNoteContentChange={setNoteContent}
          onToggleCollapsed={() => setNotesCollapsed(!notesCollapsed)}
          onSaveNote={handleSaveNote}
        />

        <ActionItemsSection
          actionItems={actionItems}
          newActionItem={newActionItem}
          isGeneratingSummary={isGeneratingSummary}
          onNewActionItemChange={setNewActionItem}
          onAddActionItem={handleAddActionItem}
          onToggleActionItem={handleToggleActionItem}
          onDeleteActionItem={handleDeleteActionItem}
          onExtractActions={handleExtractActions}
          onRegenerateActionItems={handleRegenerateActionItems}
        />
      </div>
      
      <div style={{
        backgroundColor: theme.colors.background.paper,
        borderRadius: (() => { if (compactMode) return 0; return isMobile ? theme.borderRadius.md : theme.borderRadius.xl; })(),
        padding: (() => {
          if (compactMode) return `${theme.spacing.xs} ${theme.spacing.sm}`;
          if (isMobile) return `${theme.spacing.md} ${theme.spacing.sm}`;
          return theme.spacing['2xl'];
        })(),
        paddingTop: (() => { if (compactMode) return theme.spacing.xs; return isMobile ? theme.spacing.md : theme.spacing['2xl']; })(),
        boxShadow: compactMode ? 'none' : theme.shadows.md,
        marginBottom: (() => { if (compactMode) return theme.spacing.xs; return isMobile ? theme.spacing.sm : theme.spacing.xl; })(),
      }}>
        <div style={{ marginBottom: theme.spacing.xl }}>
          <EmailDetailHeader
            email={email as any}
            threadEmails={threadEmails as Email[]}
            priorityExplanation={priorityExplanation}
            showPriorityExplanation={showPriorityExplanation}
            onFetchPriorityExplanation={handleFetchPriorityExplanation}
            onClosePriorityExplanation={() => setShowPriorityExplanation(false)}
          />
        </div>

        <EmailDetailActions
          email={email as any}
          suggestedActions={suggestedActions}
          showQuickActionsMenu={showQuickActionsMenu}
          selectedAction={selectedAction}
          onShowQuickActionsMenu={() => setShowQuickActionsMenu(true)}
          onCloseQuickActionsMenu={() => setShowQuickActionsMenu(false)}
          onSelectAction={handleActionSelected}
          onCloseAction={() => setSelectedAction(null)}
          onActionSuccess={handleActionSuccess}
          onOpenReplyComposer={handleOpenReplyComposer}
          onArchive={handleArchive}
          onDelete={handleDelete}
          onSetStarCount={handleSetStarCount}
          onBlockSender={handleBlockSender}
          onSnooze={handleSnooze}
          onRespondToInvitation={handleRespondToInvitation}
          onDraftReply={(replyDraft) => {
            setDraft(replyDraft);
            setShowReplyComposer(true);
          }}
          hideActionButtons={false}
        />

        {showReplyComposer && (
          <div ref={replyComposerRef}>
            <ReplyComposer
              showReplyComposer={showReplyComposer}
              replyMode={replyMode}
              replyRecipients={replyRecipients}
              replyCc={replyCc}
              replyBcc={replyBcc}
              showCc={showCc}
              showBcc={showBcc}
              draft={draft}
              replyOptions={replyOptions}
              selectedReplyOption={selectedReplyOption}
              loadingReplies={loadingReplies}
              checkingTone={checkingTone}
              toneCheckResult={toneCheckResult}
              sending={sending}
              textareaRef={replyTextareaRef}
              scheduledSendAt={scheduledSendAt}
              onReplyRecipientsChange={setReplyRecipients}
              onCcChange={setReplyCc}
              onBccChange={setReplyBcc}
              onShowCc={() => setShowCc(true)}
              onShowBcc={() => setShowBcc(true)}
              onDraftChange={(draft) => {
                setDraft(draft);
                setToneCheckResult(null);
                if (replyOptions && selectedReplyOption !== replyOptions.length - 1) {
                  const customIdx = replyOptions.findIndex(option => option.label === ACTION_TYPE_CUSTOM);
                  if (customIdx >= 0) setSelectedReplyOption(customIdx);
                }
              }}
              onReplyOptionSelect={(index, text) => {
                setSelectedReplyOption(index);
                setDraft(text);
              }}
              onClose={() => {
                setShowReplyComposer(false);
                setDraft('');
                setReplyOptions(null);
                setToneCheckResult(null);
              }}
              onSend={(files, expectedReplyHours, _forwardAttachmentIds, draftOverride, scheduledSendAt) => handleSendReply(files, expectedReplyHours, draftOverride, scheduledSendAt)}
              onUseRevisedText={(text) => {
                setDraft(text);
                setToneCheckResult(null);
              }}
              onDispute={disputeToneCheck}
              disputing={disputing}
              disputeResult={disputeResult}
              onSchedule={handleOpenTimePicker}
              currentEmailId={id}
              currentEmailObjectId={email?.id}
              currentEmailThreadId={(email as any)?.emailThreadId}
            />
          </div>
        )}

        {/* GitHubStatusSection - visible in full-page mode */}
        <div style={{ marginBottom: theme.spacing.xl }}>
          <GitHubStatusSection
            links={githubLinks}
            loading={loadingGithub}
            hasToken={hasGithubToken}
            onRefresh={refreshGithubInfo}
            emailSubject={email?.subject}
            emailBody={email?.body}
            emailHtmlBody={email?.htmlBody}
          />
        </div>

        {/* CRM Deals Section - shows deals associated with the email sender */}
        <div style={{ marginBottom: theme.spacing.xl }}>
          <CRMDealsSection
            senderEmail={extractEmailAddress(email?.from)}
            emailSubject={email?.subject}
          />
        </div>

        {shouldShowPhishingAlert(email?.phishingConfidence) && email?.phishingConfidence && (
          <EmailPhishingWarning
            confidence={email.phishingConfidence}
            reason={email.phishingReason ?? ''}
          />
        )}

        <SummarySection
          summary={summary}
          summaryType={summaryType}
          summaryCollapsed={summaryCollapsed}
          isGeneratingSummary={isGeneratingSummary}
          emailIsProcessingSummary={email?.isProcessingSummary}
          customRules={customRules}
          onSummaryTypeChange={(type) => {
            if (type === SUMMARY_TYPE_CUSTOM) {
              setShowRuleModal(true);
            } else if (type.startsWith(SUMMARY_TYPE_CUSTOM_PREFIX)) {
              // Properly extract ruleId by removing the prefix (handles UUIDs with hyphens)
              const ruleId = type.replace(SUMMARY_TYPE_CUSTOM_PREFIX, '');
              const rule = customRules.find(r => r.ruleId === ruleId);
              if (rule) {
                handleUseCustomRule(rule);
              } else {
                console.error('Custom rule not found:', ruleId);
              }
            } else {
              handleSummarize(type);
            }
          }}
          onToggleCollapsed={() => setSummaryCollapsed(!summaryCollapsed)}
          onShowRuleModal={() => setShowRuleModal(true)}
          onUseCustomRule={handleUseCustomRule}
        />

        <EmailThreadView
          email={email as Email}
          threadEmails={threadEmails as Email[]}
          expandedThreadItems={expandedThreadItems}
          onToggleThreadItem={toggleThreadItem}
          extractCleanBody={extractCleanBody}
          removeSignature={removeSignature}
          extractCleanHtmlBody={extractCleanHtmlBody}
          sanitizeAndProcessHtml={sanitizeAndProcessHtml}
        />
      </div>

      {user?.isAdmin && email && (
          /* eslint-disable i18next/no-literal-string */
          (() => {
                const emailData = email as any;
                return (
                  <div style={{
                    marginTop: theme.spacing.xl,
                    padding: theme.spacing.lg,
                    backgroundColor: theme.colors.background.subtle,
                    borderRadius: theme.borderRadius.md,
                    border: `1px solid ${theme.colors.border.light}`,
                  }}>
                    <h3 style={{
                      marginTop: 0,
                      marginBottom: theme.spacing.md,
                      fontSize: theme.typography.fontSize.sm,
                      fontWeight: FONT_WEIGHT_SEMIBOLD,
                      color: theme.colors.text.primary,
                    }}>
                      {DEBUG_INFO_TITLE}
                    </h3>
                    <div style={{
                      fontFamily: STRING_MONOSPACE,
                      fontSize: theme.typography.fontSize.xs,
                      color: theme.colors.text.secondary,
                      lineHeight: 1.6,
                    }}>
                      <div><strong>{DEBUG_LABEL_GMAIL_MESSAGE_ID}</strong> {emailData.messageId || STRING_NA}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: STYLE_GAP_8PX }}>
                        <strong>{DEBUG_LABEL_GMAIL_THREAD_ID}</strong>
                        <code style={{
                          backgroundColor: theme.colors.primary.subtle,
                          padding: STYLE_PADDING_2PX_6PX,
                          borderRadius: STYLE_RADIUS_4PX,
                          fontFamily: STRING_MONOSPACE,
                        }}>
                          {emailData.threadId || STRING_NA}
                        </code>
                        {emailData.threadId && (
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(emailData.threadId);
                              alert(ALERT_THREAD_ID_COPIED);
                            }}
                            style={{
                              padding: STYLE_PADDING_2PX_8PX,
                              fontSize: STYLE_FONT_SIZE_11PX,
                              backgroundColor: theme.colors.primary.main,
                              color: theme.colors.background.paper,
                              border: STRING_NONE,
                              borderRadius: STYLE_RADIUS_4PX,
                              cursor: 'pointer',
                            }}
                          >
                            {STRING_COPY}
                          </button>
                        )}
                      </div>
                      <div><strong>{DEBUG_LABEL_LABELS}</strong> {emailData.labels ? JSON.stringify(emailData.labels) : STRING_EMPTY_ARRAY}</div>
                      <div><strong>{DEBUG_LABEL_LABELS_COUNT}</strong> {emailData.labels?.length || 0}</div>
                      <div><strong>{DEBUG_LABEL_RECEIVED_AT}</strong> {emailData.receivedAt}</div>
                      <div><strong>{DEBUG_LABEL_IS_READ}</strong> {emailData.isRead ? STRING_TRUE_TEXT : STRING_FALSE_TEXT}</div>
                      <div><strong>{DEBUG_LABEL_IS_ARCHIVED}</strong> {emailData.isArchived ? STRING_TRUE_TEXT : STRING_FALSE_TEXT}</div>
                      <div><strong>{DEBUG_LABEL_STAR_COUNT}</strong> {emailData.starCount || 0}</div>
                      {threadEmails && threadEmails.length > 0 && (
                        <div style={{ marginTop: theme.spacing.md }}>
                          <strong>{DEBUG_LABEL_THREAD_EMAILS} ({threadEmails.length}):</strong>
                          {threadEmails.map((threadEmail, idx) => {
                            const threadEmailData = threadEmail as any;
                            return (
                              <div key={threadEmail.id} style={{ marginLeft: theme.spacing.md, marginTop: theme.spacing.xs }}>
                                [{idx}] {DEBUG_LABEL_MSG_ID} {threadEmailData.messageId || STRING_NA} | {DEBUG_LABEL_LABELS} {threadEmailData.labels ? JSON.stringify(threadEmailData.labels) : STRING_EMPTY_ARRAY} | {DEBUG_LABEL_RECEIVED} {threadEmailData.receivedAt}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()
          /* eslint-enable i18next/no-literal-string */
        )}
      </>
    );

  // In compact mode, render inline sections (no side tabs)
  if (compactMode) {
    return (
      <div style={{ display: 'flex', height: '100%', overflow: 'hidden', position: 'relative' }}>
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: theme.spacing.sm }}>
          <div style={{ marginBottom: theme.spacing.sm }}>
            <PrivateNotesSection
              noteContent={noteContent}
              notesCollapsed={notesCollapsed}
              onNoteContentChange={setNoteContent}
              onToggleCollapsed={() => setNotesCollapsed(!notesCollapsed)}
              onSaveNote={handleSaveNote}
            />

            <ActionItemsSection
              actionItems={actionItems}
              newActionItem={newActionItem}
              isGeneratingSummary={isGeneratingSummary}
              onNewActionItemChange={setNewActionItem}
              onAddActionItem={handleAddActionItem}
              onToggleActionItem={handleToggleActionItem}
              onDeleteActionItem={handleDeleteActionItem}
              onExtractActions={handleExtractActions}
              onRegenerateActionItems={handleRegenerateActionItems}
            />

            <GitHubStatusSection
              links={githubLinks}
              loading={loadingGithub}
              hasToken={hasGithubToken}
              onRefresh={refreshGithubInfo}
              emailSubject={email?.subject}
              emailBody={email?.body}
              emailHtmlBody={email?.htmlBody}
            />

            <CRMDealsSection
              senderEmail={extractEmailAddress(email?.from)}
              emailSubject={email?.subject}
            />
          </div>

          <div style={{
            backgroundColor: theme.colors.background.paper,
            borderRadius: 0,
            padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
            paddingTop: theme.spacing.xs,
            boxShadow: 'none',
            marginBottom: theme.spacing.xs,
          }}>
            <div style={{ marginBottom: theme.spacing.sm }}>
              <EmailDetailHeader
                email={email as any}
                threadEmails={threadEmails as Email[]}
                priorityExplanation={priorityExplanation}
                showPriorityExplanation={showPriorityExplanation}
                onFetchPriorityExplanation={handleFetchPriorityExplanation}
                onClosePriorityExplanation={() => setShowPriorityExplanation(false)}
              />
            </div>

            <EmailDetailActions
              email={email as any}
              suggestedActions={suggestedActions}
              showQuickActionsMenu={showQuickActionsMenu}
              selectedAction={selectedAction}
              onShowQuickActionsMenu={() => setShowQuickActionsMenu(true)}
              onCloseQuickActionsMenu={() => setShowQuickActionsMenu(false)}
              onSelectAction={handleActionSelected}
              onCloseAction={() => setSelectedAction(null)}
              onActionSuccess={handleActionSuccess}
              onOpenReplyComposer={handleOpenReplyComposer}
              onArchive={handleArchive}
              onDelete={handleDelete}
              onSetStarCount={handleSetStarCount}
              onBlockSender={handleBlockSender}
              onSnooze={handleSnooze}
              onRespondToInvitation={handleRespondToInvitation}
              onDraftReply={(replyDraft) => {
                setDraft(replyDraft);
                setShowReplyComposer(true);
              }}
              hideActionButtons
            />

            {showReplyComposer && (
              <div ref={replyComposerRef}>
                <ReplyComposer
                  showReplyComposer={showReplyComposer}
                  replyMode={replyMode}
                  replyRecipients={replyRecipients}
                  replyCc={replyCc}
                  replyBcc={replyBcc}
                  showCc={showCc}
                  showBcc={showBcc}
                  draft={draft}
                  replyOptions={replyOptions}
                  selectedReplyOption={selectedReplyOption}
                  loadingReplies={loadingReplies}
                  checkingTone={checkingTone}
                  toneCheckResult={toneCheckResult}
                  sending={sending}
                  textareaRef={replyTextareaRef}
                  scheduledSendAt={scheduledSendAt}
                  onReplyRecipientsChange={setReplyRecipients}
                  onCcChange={setReplyCc}
                  onBccChange={setReplyBcc}
                  onShowCc={() => setShowCc(true)}
                  onShowBcc={() => setShowBcc(true)}
                  onDraftChange={(newDraft) => {
                    setDraft(newDraft);
                    setToneCheckResult(null);
                    if (replyOptions && selectedReplyOption !== replyOptions.length - 1) {
                      const customIdx = replyOptions.findIndex(option => option.label === ACTION_TYPE_CUSTOM);
                      if (customIdx >= 0) setSelectedReplyOption(customIdx);
                    }
                  }}
                  onReplyOptionSelect={(index, text) => {
                    setSelectedReplyOption(index);
                    setDraft(text);
                  }}
                  onClose={() => {
                    setShowReplyComposer(false);
                    setDraft('');
                    setReplyOptions(null);
                    setToneCheckResult(null);
                  }}
                  onSend={(files, expectedReplyHours, _forwardAttachmentIds, draftOverride, scheduledSendAt) => handleSendReply(files, expectedReplyHours, draftOverride, scheduledSendAt)}
                  onUseRevisedText={(text) => {
                    setDraft(text);
                    setToneCheckResult(null);
                  }}
                  onDispute={disputeToneCheck}
                  disputing={disputing}
                  disputeResult={disputeResult}
                  onSchedule={handleOpenTimePicker}
                  currentEmailId={id}
                  currentEmailObjectId={email?.id}
                  currentEmailThreadId={(email as any)?.emailThreadId}
                />
              </div>
            )}

            <SummarySection
              summary={summary}
              summaryType={summaryType}
              summaryCollapsed={summaryCollapsed}
              isGeneratingSummary={isGeneratingSummary}
              emailIsProcessingSummary={email?.isProcessingSummary}
              customRules={customRules}
              onSummaryTypeChange={(type) => {
                if (type === SUMMARY_TYPE_CUSTOM) {
                  setShowRuleModal(true);
                } else if (type.startsWith(SUMMARY_TYPE_CUSTOM_PREFIX)) {
                  const ruleId = type.replace(SUMMARY_TYPE_CUSTOM_PREFIX, '');
                  const rule = customRules.find(r => r.ruleId === ruleId);
                  if (rule) {
                    handleUseCustomRule(rule);
                  } else {
                    console.error('Custom rule not found:', ruleId);
                  }
                } else {
                  handleSummarize(type);
                }
              }}
              onToggleCollapsed={() => setSummaryCollapsed(!summaryCollapsed)}
              onShowRuleModal={() => setShowRuleModal(true)}
              onUseCustomRule={handleUseCustomRule}
            />

            <EmailThreadView
              email={email as Email}
              threadEmails={threadEmails as Email[]}
              expandedThreadItems={expandedThreadItems}
              onToggleThreadItem={toggleThreadItem}
              extractCleanBody={extractCleanBody}
              removeSignature={removeSignature}
              extractCleanHtmlBody={extractCleanHtmlBody}
              sanitizeAndProcessHtml={sanitizeAndProcessHtml}
            />
          </div>

        </div>

        <CustomRuleModal
          show={showRuleModal}
          customRule={customRule}
          onCustomRuleChange={setCustomRule}
          onClose={() => {
            setShowRuleModal(false);
            setCustomRule({ whenToUse: '', howToSummarize: '' });
          }}
          onCreate={handleCreateCustomRule}
        />
      </div>
    );
  }

  // Full page mode with sidebar and overlay
  return (
    <>
      <EmailDetailAnimationOverlay animationClass={animationClass} />
      <EmailDetailSidebar />

      <div style={{
        height: STYLE_100VH,
        backgroundColor: theme.colors.background.default,
        overflow: STRING_HIDDEN,
        position: STRING_RELATIVE,
      }}>
        <div style={{
          height: '100%',
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: isMobile
            ? `70px ${theme.spacing.xs} ${theme.spacing.md}`
            : theme.spacing['2xl'],
        }}>
          <div style={{ maxWidth: isMobile ? '100%' : STYLE_MAX_WIDTH_900PX, margin: STYLE_MARGIN_0_AUTO }}>
            {emailContent}
          </div>
        </div>
      </div>

      <CustomRuleModal
        show={showRuleModal}
        customRule={customRule}
        onCustomRuleChange={setCustomRule}
        onClose={() => {
          setShowRuleModal(false);
          setCustomRule({ whenToUse: '', howToSummarize: '' });
        }}
        onCreate={handleCreateCustomRule}
      />

      {showTimePicker && (
        <TimePicker
          selectedTime={scheduledSendAt}
          suggestions={timeSuggestions}
          warning={timeWarning}
          suggestedTime={suggestedTime}
          onTimeSelect={handleTimeSelect}
          onCancel={handleCancelTimePicker}
        />
      )}
    </>
  );
});

export default EmailDetail;
