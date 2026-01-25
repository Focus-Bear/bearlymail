import React, { useEffect, useImperativeHandle, forwardRef, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { captureEvent } from 'utils/posthog';
import { useAuth } from 'contexts/AuthContext';
import { devLog } from 'utils/dev-logger';
import { GitHubStatusSection } from 'components/github/GitHubStatusSection';
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
import { EmailDetailActions } from 'components/email-detail/EmailDetailActions';
import { EmailThreadView } from 'components/email-detail/EmailThreadView';
import { CustomRuleModal } from 'components/email-detail/CustomRuleModal';
import { Email } from 'types/email';
import { ACTION_TYPE_CUSTOM, SUMMARY_TYPE_CUSTOM, SUMMARY_TYPE_CUSTOM_PREFIX } from 'constants/strings';

interface EmailDetailProps {
  emailId?: string;
  compactMode?: boolean; // When true, renders without sidebar, overlay, and full-page layout for use in split view
  onArchiveComplete?: () => void; // Called after archive completes in split view mode
  autoGenerateReplies?: boolean; // When true, automatically generates reply drafts when email loads
}

// Methods exposed via ref for external control (e.g., from SplitViewPanel header)
export interface EmailDetailRef {
  openReplyComposer: () => void;
  archive: () => void;
  setStarCount: (count: number) => void;
  getStarCount: () => number;
}

// eslint-disable-next-line max-lines-per-function -- Email detail page requires handling multiple email operations and UI states
const EmailDetail = forwardRef<EmailDetailRef, EmailDetailProps>(({ emailId: propEmailId, compactMode = false, onArchiveComplete, autoGenerateReplies = false }, ref) => {
  const params = useParams<{ id: string }>();
  const id = propEmailId || params.id;
  const { t } = useTranslation();
  const { user } = useAuth();
  const replyTextareaRef = useRef<HTMLTextAreaElement>(null);
  const replyComposerRef = useRef<HTMLDivElement>(null);
  
  const state = useEmailDetailState();
  const operations = useEmailDetailOperations(id, state, { onArchiveComplete });
  
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
    loadingReplies,
    sending,
    toneCheckResult,
    checkingTone,
    disputing,
    disputeResult,
    snoozeInput,
    showSnoozeInput,
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
    setToneCheckResult,
    setSnoozeInput,
    setShowSnoozeInput,
    setShowPriorityExplanation,
    setShowQuickActionsMenu,
    setSelectedAction,
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
    threadEmails,
    actionItems,
  });

  // Expose methods via ref for external control (e.g., SplitViewPanel header actions)
  useImperativeHandle(ref, () => ({
    openReplyComposer: () => {
      handleOpenReplyComposer('reply');
      // Scroll to reply composer and focus the textarea after a short delay to ensure it's mounted
      setTimeout(() => {
        replyComposerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        replyTextareaRef.current?.focus();
      }, 100);
    },
    archive: () => {
      handleArchive();
    },
    setStarCount: (count: number) => {
      if (email?.id) {
        handleSetStarCount(email.id, count);
      }
    },
    getStarCount: () => {
      return (email as any)?.starCount ?? 0;
    },
  }), [handleOpenReplyComposer, handleArchive, handleSetStarCount, email]);

  useEffect(() => {
    if (id && email) {
      captureEvent('email_detail_viewed', { email_id: id });
    }
  }, [id, email]);

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

  // Load existing draft when opening an email
  useEffect(() => {
    if (email?.threadId) {
      const loadDraft = async () => {
        const savedDraft = await fetchDraft();
        if (savedDraft && savedDraft.content) {
          setDraft(savedDraft.content);
          setShowReplyComposer(true);
          if (savedDraft.replyMode) {
            state.setReplyMode(savedDraft.replyMode);
          }
          if (savedDraft.recipients) {
            setReplyRecipients(savedDraft.recipients);
          }
        }
      };
      loadDraft();
    }
  }, [email?.threadId, fetchDraft, setDraft, setShowReplyComposer, setReplyRecipients, state]);

  // Auto-save draft every 10 seconds while reply composer is open
  useEffect(() => {
    if (!showReplyComposer || !email?.threadId) {
      return;
    }

    const autoSaveInterval = setInterval(() => {
      if (draft && draft.trim()) {
        saveDraft(draft, replyMode, replyRecipients);
      }
    }, 10000);

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

  // Auto-generate reply drafts when email loads (for "For Action" mode)
  // Also auto-open the reply composer so users see suggested replies immediately
  const autoGeneratedRef = useRef<string | null>(null);
  useEffect(() => {
    if (autoGenerateReplies && id && email && autoGeneratedRef.current !== id && !replyOptions) {
      autoGeneratedRef.current = id;
      handleOpenReplyComposer('reply');
    }
  }, [autoGenerateReplies, id, email, replyOptions, handleOpenReplyComposer]);

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
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
      {!compactMode && (
        <div style={{ marginBottom: theme.spacing.xl }}>
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
      )}
      
      <div style={{
        backgroundColor: theme.colors.background.paper,
        borderRadius: compactMode ? 0 : theme.borderRadius.xl,
        padding: compactMode ? `${theme.spacing.xs} ${theme.spacing.sm}` : theme.spacing['2xl'],
        paddingTop: compactMode ? theme.spacing.xs : theme.spacing['2xl'],
        boxShadow: compactMode ? 'none' : theme.shadows.md,
        marginBottom: compactMode ? theme.spacing.xs : theme.spacing.xl,
      }}>
        <div style={{ marginBottom: compactMode ? theme.spacing.sm : theme.spacing.xl }}>
          <EmailDetailHeader
            email={email as any}
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
          onRespondToInvitation={handleRespondToInvitation}
          hideActionButtons={compactMode}
        />

        {showReplyComposer && (
          <div ref={replyComposerRef}>
            <ReplyComposer
              showReplyComposer={showReplyComposer}
              replyMode={replyMode}
              replyRecipients={replyRecipients}
              draft={draft}
              replyOptions={replyOptions}
              selectedReplyOption={selectedReplyOption}
              loadingReplies={loadingReplies}
              checkingTone={checkingTone}
              toneCheckResult={toneCheckResult}
              sending={sending}
              textareaRef={replyTextareaRef}
              onReplyRecipientsChange={setReplyRecipients}
              onDraftChange={(draft) => {
                setDraft(draft);
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
              onSend={handleSendReply}
              onUseRevisedText={(text) => setDraft(text)}
              onDispute={disputeToneCheck}
              disputing={disputing}
              disputeResult={disputeResult}
            />
          </div>
        )}

        {/* GitHubStatusSection - visible in both modes, positioned above summary */}
        <div style={{ marginBottom: compactMode ? theme.spacing.md : theme.spacing.xl }}>
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

      {!compactMode && user?.isAdmin && email && (
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
                      fontWeight: 600,
                      color: theme.colors.text.primary,
                    }}>
                      Debug Information (Admin Only)
                    </h3>
                    <div style={{
                      fontFamily: 'monospace',
                      fontSize: theme.typography.fontSize.xs,
                      color: theme.colors.text.secondary,
                      lineHeight: 1.6,
                    }}>
                      <div><strong>Email ID:</strong> {emailData.id}</div>
                      <div><strong>Thread ID:</strong> {emailData.threadId || 'N/A'}</div>
                      <div><strong>Email Thread ID:</strong> {emailData.emailThreadId || 'N/A'}</div>
                      <div><strong>Message ID:</strong> {emailData.messageId || 'N/A'}</div>
                      <div><strong>Labels:</strong> {emailData.labels ? JSON.stringify(emailData.labels) : '[]'}</div>
                      <div><strong>Labels Count:</strong> {emailData.labels?.length || 0}</div>
                      <div><strong>Received At:</strong> {emailData.receivedAt}</div>
                      <div><strong>Is Read:</strong> {emailData.isRead ? 'true' : 'false'}</div>
                      <div><strong>Is Archived:</strong> {emailData.isArchived ? 'true' : 'false'}</div>
                      <div><strong>Star Count:</strong> {emailData.starCount || 0}</div>
                      {threadEmails && threadEmails.length > 0 && (
                        <div style={{ marginTop: theme.spacing.md }}>
                          <strong>Thread Emails ({threadEmails.length}):</strong>
                          {threadEmails.map((threadEmail, idx) => {
                            const threadEmailData = threadEmail as any;
                            return (
                              <div key={threadEmail.id} style={{ marginLeft: theme.spacing.md, marginTop: theme.spacing.xs }}>
                                [{idx}] ID: {threadEmailData.id} | Labels: {threadEmailData.labels ? JSON.stringify(threadEmailData.labels) : '[]'} | Received: {threadEmailData.receivedAt}
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

  // In compact mode, return just the content without full-page layout
  if (compactMode) {
    return (
      <div style={{ padding: theme.spacing.sm, paddingBottom: 0 }}>
        {emailContent}
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
    <div style={{
      display: 'flex',
      height: '100vh',
      backgroundColor: theme.colors.background.default,
      overflow: 'hidden',
      position: 'relative',
    }}>
      <EmailDetailAnimationOverlay animationClass={animationClass} />
      <EmailDetailSidebar />

      <div style={{ flex: 1, overflowY: 'auto', padding: theme.spacing['2xl'] }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          {emailContent}
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
});

export default EmailDetail;
