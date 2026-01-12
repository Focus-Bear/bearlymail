import React, { useEffect } from 'react';
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

// Immediate log when module loads - this should ALWAYS show
console.log('[EmailDetail] ===== MODULE LOADED =====');
console.log('[EmailDetail] File is being imported/executed');
console.log('[EmailDetail] Current URL:', typeof window !== 'undefined' ? window.location.href : 'N/A');

interface EmailDetailProps {
  emailId?: string;
  compactMode?: boolean; // When true, renders without sidebar, overlay, and full-page layout for use in split view
}

// eslint-disable-next-line max-lines-per-function -- Email detail page requires handling multiple email operations and UI states
const EmailDetail: React.FC<EmailDetailProps> = ({ emailId: propEmailId, compactMode = false }) => {
  console.log('[EmailDetail] ===== COMPONENT FUNCTION CALLED =====');
  const params = useParams<{ id: string }>();
  const id = propEmailId || params.id;
  const { t } = useTranslation();
  const { user } = useAuth();
  
  // Always log to verify component is rendering (even if not localhost)
  console.log('[EmailDetail] Component rendering', { 
    id, 
    hasUser: !!user, 
    isAdmin: user?.isAdmin,
    userObject: user,
    windowLocation: typeof window !== 'undefined' ? window.location.href : 'N/A'
  });
  
  const state = useEmailDetailState();
  const operations = useEmailDetailOperations(id, state);
  
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
    handleSendReply,
    handleArchive,
    handleSnooze,
    handleDelete,
    handleSetStarCount,
    handleBlockSender,
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
    threadEmails,
  });

  useEffect(() => {
    if (id && email) {
      captureEvent('email_detail_viewed', { email_id: id });
    }
  }, [id, email]);

  // Debug logging for admin check
  useEffect(() => {
    // Always log to console to verify useEffect is running
    console.log('[EmailDetail] useEffect - User check:', { 
      user: user ? { id: user.id, email: user.email, isAdmin: user.isAdmin } : null,
      hasUser: !!user,
      isAdmin: user?.isAdmin,
      hasEmail: !!email,
      emailId: email?.id,
    });
    devLog('EmailDetail - User check:', { 
      user: user ? { id: user.id, email: user.email, isAdmin: user.isAdmin } : null,
      hasUser: !!user,
      isAdmin: user?.isAdmin,
      hasEmail: !!email,
      emailId: email?.id,
    });
  }, [user, email]);

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
        padding: compactMode ? `${theme.spacing.sm} ${theme.spacing.md}` : theme.spacing['2xl'],
        paddingTop: compactMode ? theme.spacing.sm : theme.spacing['2xl'],
        boxShadow: compactMode ? 'none' : theme.shadows.md,
        marginBottom: compactMode ? theme.spacing.md : theme.spacing.xl,
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
        />

        {showReplyComposer && (
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

      {/* GitHubStatusSection - visible in both modes */}
      <div style={{ marginBottom: compactMode ? theme.spacing.md : theme.spacing.xl }}>
        <GitHubStatusSection
          links={githubLinks}
          loading={loadingGithub}
          hasToken={hasGithubToken}
          onRefresh={refreshGithubInfo}
        />
      </div>

      {!compactMode && (
          /* eslint-disable i18next/no-literal-string */
          (() => {
                // Always log to console to verify this code is running
                console.log('[EmailDetail] Debug section render check:', {
                  hasUser: !!user,
                  isAdmin: user?.isAdmin,
                  hasEmail: !!email,
                  userObject: user,
                });
                
                devLog('EmailDetail - Debug section render check:', {
                  hasUser: !!user,
                  isAdmin: user?.isAdmin,
                  hasEmail: !!email,
                  userObject: user,
                });
                
                if (!user?.isAdmin) {
                  console.log('[EmailDetail] Debug section not shown: user is not admin', { user });
                  devLog('EmailDetail - Debug section not shown: user is not admin');
                  return null;
                }
                
                if (!email) {
                  console.log('[EmailDetail] Debug section not shown: no email');
                  devLog('EmailDetail - Debug section not shown: no email');
                  return null;
                }
                
                console.log('[EmailDetail] Showing debug section!');
                devLog('EmailDetail - Showing debug section');
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
      <div style={{ padding: theme.spacing.md }}>
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
};

export default EmailDetail;
