import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { theme } from 'theme/theme';
import { Email } from 'types/email';
import { extractEmailAddress, getCorrespondent } from 'utils/emailUtils';
import { captureEvent } from 'utils/posthog';

import { TimePicker } from 'components/compose/TimePicker';
import { CRMDealsSection } from 'components/crm/CRMDealsSection';
import { CustomRuleModal } from 'components/email-detail/CustomRuleModal';
import { EmailDetailActions } from 'components/email-detail/EmailDetailActions';
import { EmailDetailAnimationOverlay } from 'components/email-detail/EmailDetailAnimationOverlay';
import { EmailDetailDebugInfo } from 'components/email-detail/EmailDetailDebugInfo';
import { EmailDetailHeader } from 'components/email-detail/EmailDetailHeader';
import { EmailDetailSidebar } from 'components/email-detail/EmailDetailSidebar';
import { EmailPhishingWarning, shouldShowPhishingAlert } from 'components/email-detail/EmailPhishingWarning';
import { EmailThreadView } from 'components/email-detail/EmailThreadView';
import { SummarySection } from 'components/email-detail/SummarySection';
import { ActionItemsSection } from 'components/email-detail-inline/ActionItemsSection';
import { EmailNotFound } from 'components/email-detail-inline/EmailNotFound';
import { LoadingSpinner } from 'components/email-detail-inline/LoadingSpinner';
import { PrivateNotesSection } from 'components/email-detail-inline/PrivateNotesSection';
import { ReplyComposer } from 'components/email-detail-inline/ReplyComposer';
import { GitHubStatusSection } from 'components/github/GitHubStatusSection';
import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import { SUMMARY_TYPE_CUSTOM, SUMMARY_TYPE_CUSTOM_PREFIX } from 'constants/strings';
import { useAuth } from 'contexts/AuthContext';
import { useEmailDetailDraftHandlers } from 'hooks/useEmailDetailDraftHandlers';
import { useEmailDetailDraftSync } from 'hooks/useEmailDetailDraftSync';
import { useEmailDetailInitialization } from 'hooks/useEmailDetailInitialization';
import { useEmailDetailOperations } from 'hooks/useEmailDetailOperations';
import { useEmailDetailState } from 'hooks/useEmailDetailState';
import { useEmailDetailTimePicker } from 'hooks/useEmailDetailTimePicker';
import { useResponsiveBreakpoints } from 'hooks/useResponsiveBreakpoints';

/**
 * Controls how `EmailDetail` renders.
 * - `full`    — default full-page view with sidebar, animation overlay, summary section
 * - `compact` — split-view mode: no sidebar/overlay, forwardRef control (was `compactMode=true`)
 * - `inline`  — panel/drawer mode: no sidebar/overlay/header/summary, `onClose` callback
 *               (replaces the now-deleted `EmailDetailInline` component — see #698)
 */
export type EmailDetailVariant = 'full' | 'compact' | 'inline';

export const EMAIL_DETAIL_VARIANT_FULL: EmailDetailVariant = 'full';
export const EMAIL_DETAIL_VARIANT_COMPACT: EmailDetailVariant = 'compact';
export const EMAIL_DETAIL_VARIANT_INLINE: EmailDetailVariant = 'inline';

interface EmailDetailProps {
  emailId?: string;
  /** @deprecated Use `displayVariant="compact"` instead. Kept for backward compat. */
  compactMode?: boolean; // When true, renders without sidebar, overlay, and full-page layout for use in split view
  /** Rendering variant. When not set, falls back to `compactMode` flag, then defaults to 'full'. */
  displayVariant?: EmailDetailVariant;
  onArchiveComplete?: (emailId: string) => void; // Called after archive completes in split view mode
  onSnoozeComplete?: (emailId: string) => void; // Called after snooze completes in split view mode
  autoGenerateReplies?: boolean; // When true, automatically generates reply drafts when email loads
  onCorrespondentChange?: (correspondent: { name: string; email: string }) => void; // Called when correspondent info is available
  /** Called when the inline panel should close (only used with `displayVariant="inline"`). */
  onClose?: () => void;
}

// Methods exposed via ref for external control (e.g., from SplitViewPanel header)
export interface EmailDetailRef {
  openReplyComposer: (mode?: 'reply' | 'replyAll' | 'forward') => void;
  archive: () => void;
  snooze: (duration: string) => void;
  setStarCount: (count: number) => void;
  getStarCount: () => number;
}

const EmailDetailLoadingScreen: React.FC<{ isInline: boolean; loadingText: string }> = ({ isInline, loadingText }) => {
  if (isInline) {
    return <LoadingSpinner />;
  }
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        backgroundColor: theme.colors.background.default,
        color: theme.colors.text.secondary,
      }}
    >
      {loadingText}
    </div>
  );
};

const EmailDetailNotFoundScreen: React.FC<{ isInline: boolean; notFoundText: string }> = ({ isInline, notFoundText }) => {
  if (isInline) {
    return <EmailNotFound />;
  }
  return <div>{notFoundText}</div>;
};

function getEmailContentCardStyle(compactMode: boolean, isMobile: boolean): React.CSSProperties {
  if (compactMode) {
    return {
      backgroundColor: theme.colors.background.paper,
      borderRadius: 0,
      padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
      paddingTop: theme.spacing.xs,
      boxShadow: 'none',
      marginBottom: theme.spacing.xs,
    };
  }
  return {
    backgroundColor: theme.colors.background.paper,
    borderRadius: isMobile ? theme.borderRadius.md : theme.borderRadius.xl,
    padding: isMobile ? `${theme.spacing.md} ${theme.spacing.sm}` : theme.spacing['2xl'],
    paddingTop: isMobile ? theme.spacing.md : theme.spacing['2xl'],
    boxShadow: theme.shadows.md,
    marginBottom: isMobile ? theme.spacing.sm : theme.spacing.xl,
  };
}

const EmailDetail = forwardRef<EmailDetailRef, EmailDetailProps>(
  (
    {
      emailId: propEmailId,
      compactMode = false,
      displayVariant,
      onArchiveComplete,
      onSnoozeComplete,
      autoGenerateReplies = false,
      onCorrespondentChange,
      onClose,
    },
    ref
  ) => {
    // Resolve effective variant: explicit prop wins, then legacy compactMode, then 'full'.
    const effectiveVariant: EmailDetailVariant =
      displayVariant ?? (compactMode ? EMAIL_DETAIL_VARIANT_COMPACT : EMAIL_DETAIL_VARIANT_FULL);
    const isCompact = effectiveVariant === EMAIL_DETAIL_VARIANT_COMPACT;
    const isInline = effectiveVariant === EMAIL_DETAIL_VARIANT_INLINE;
    const params = useParams<{ id: string }>();
    const id = propEmailId || params.id;
    const { t } = useTranslation();
    const { user } = useAuth();
    const { isMobile } = useResponsiveBreakpoints();
    const replyTextareaRef = useRef<HTMLTextAreaElement>(null);
    const replyComposerRef = useRef<HTMLDivElement>(null);
    const {
      showTimePicker,
      scheduledSendAt,
      setScheduledSendAt,
      timeWarning,
      suggestedTime,
      timeSuggestions,
      handleOpenTimePicker,
      handleTimeSelect,
      handleCancelTimePicker,
    } = useEmailDetailTimePicker();

    const state = useEmailDetailState();
    const ops = useEmailDetailOperations(id, state, { onArchiveComplete, onSnoozeComplete });
    const { email, loading, animationClass, showRuleModal, customRule } = state;

    useEmailDetailInitialization({
      id,
      email,
      isGeneratingSummary: state.isGeneratingSummary,
      summaryType: state.summaryType,
      summary: state.summary,
      fetchCustomRules: ops.fetchCustomRules,
      fetchEmail: ops.fetchEmail,
      fetchGithubInfo: ops.fetchGithubInfo,
      fetchSuggestedActions: ops.fetchSuggestedActions,
      fetchNote: ops.fetchNote,
      fetchThreadEmails: ops.fetchThreadEmails,
      handleUseCustomRule: ops.handleUseCustomRule,
      handleSummarize: ops.handleSummarize,
      setSummary: state.setSummary,
      setSummaryType: state.setSummaryType,
      setSummaryCollapsed: state.setSummaryCollapsed,
      setActionItems: state.setActionItems,
      setExpandedThreadItems: state.setExpandedThreadItems,
      setThreadEmails: state.setThreadEmails,
      setLoading: state.setLoading,
      setEmail: state.setEmail,
      threadEmails: state.threadEmails,
      actionItems: state.actionItems,
    });

    useImperativeHandle(
      ref,
      () => ({
        openReplyComposer: (mode: 'reply' | 'replyAll' | 'forward' = 'reply') => {
          ops.handleOpenReplyComposer(mode);
          setTimeout(() => {
            replyComposerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            replyTextareaRef.current?.focus();
          }, 100);
        },
        archive: () => ops.handleArchive(),
        snooze: (duration: string) => ops.handleSnooze(duration),
        setStarCount: (count: number) => {
          if (email?.id) {
            ops.handleSetStarCount(email.id, count);
          }
        },
        getStarCount: () => (email as any)?.starCount ?? 0,
      }),
      [ops, email]
    );

    // Scheduling handlers are provided by useEmailDetailTimePicker

    useEffect(() => {
      if (id && email) {
        captureEvent(ANALYTICS_EVENTS.EMAIL_DETAIL_VIEWED, { email_id: id });
      }
    }, [id, email]);

    useEffect(() => {
      if (email && onCorrespondentChange) {
        const correspondent = getCorrespondent(email, user?.email, state.threadEmails);
        onCorrespondentChange({ name: correspondent.name, email: correspondent.email });
      }
    }, [email, state.threadEmails, user?.email, onCorrespondentChange]);

    useEmailDetailDraftSync({
      id,
      email,
      draft: state.draft,
      replyMode: state.replyMode,
      replyRecipients: state.replyRecipients,
      autoGenerateReplies,
      replyOptions: state.replyOptions,
      showReplyComposer: state.showReplyComposer,
      replyComposerRef,
      saveDraft: ops.saveDraft,
      fetchDraft: ops.fetchDraft,
      setDraft: state.setDraft,
      setReplyRecipients: state.setReplyRecipients,
      setReplyMode: state.setReplyMode,
      setShowReplyComposer: state.setShowReplyComposer,
      setReplyOptions: state.setReplyOptions,
      setToneCheckResult: state.setToneCheckResult,
      handleGenerateDraft: ops.handleGenerateDraft,
    });

    if (loading) {
      return <EmailDetailLoadingScreen isInline={isInline} loadingText={t('emailDetail.loadingEmail')} />;
    }

    if (!email) {
      return <EmailDetailNotFoundScreen isInline={isInline} notFoundText={t('emailDetail.emailNotFound')} />;
    }

    const handleClearSchedule = () => setScheduledSendAt(null);
    const emailContent = (
      <EmailDetailContent
        state={state}
        ops={ops}
        scheduledSendAt={scheduledSendAt}
        effectiveVariant={effectiveVariant}
        isMobile={isMobile}
        id={id}
        user={user}
        replyTextareaRef={replyTextareaRef}
        replyComposerRef={replyComposerRef}
        handleOpenTimePicker={handleOpenTimePicker}
        handleClearSchedule={handleClearSchedule}
        onClose={onClose}
      />
    );

    // In compact or inline mode, render without sidebar/overlay
    if (isCompact || isInline) {
      return (
        <div style={{ display: 'flex', height: '100%', overflow: 'hidden', position: 'relative' }}>
          <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: theme.spacing.sm }}>
            {emailContent}
          </div>
          <CustomRuleModal
            show={showRuleModal}
            customRule={customRule}
            onCustomRuleChange={state.setCustomRule}
            onClose={() => {
              state.setShowRuleModal(false);
              state.setCustomRule({ whenToUse: '', howToSummarize: '' });
            }}
            onCreate={ops.handleCreateCustomRule}
          />
        </div>
      );
    }

    return (
      <EmailDetailFullLayout
        animationClass={animationClass}
        isMobile={isMobile}
        emailContent={emailContent}
        showRuleModal={showRuleModal}
        customRule={customRule}
        onCustomRuleChange={state.setCustomRule}
        onCloseRuleModal={() => {
          state.setShowRuleModal(false);
          state.setCustomRule({ whenToUse: '', howToSummarize: '' });
        }}
        onCreateCustomRule={async () => {
 await ops.handleCreateCustomRule(); 
}}
        showTimePicker={showTimePicker}
        scheduledSendAt={scheduledSendAt}
        timeSuggestions={timeSuggestions}
        timeWarning={timeWarning}
        suggestedTime={suggestedTime}
        onTimeSelect={handleTimeSelect}
        onCancelTimePicker={handleCancelTimePicker}
      />
    );
  }
);

export default EmailDetail;

interface EmailDetailFullLayoutProps {
  animationClass: string | null;
  isMobile: boolean;
  emailContent: React.ReactNode;
  showRuleModal: boolean;
  customRule: { whenToUse: string; howToSummarize: string };
  onCustomRuleChange: (rule: { whenToUse: string; howToSummarize: string }) => void;
  onCloseRuleModal: () => void;
  onCreateCustomRule: () => Promise<void>;
  showTimePicker: boolean;
  scheduledSendAt: Date | null;
  timeSuggestions: any[];
  timeWarning: string | undefined;
  suggestedTime: Date | undefined;
  onTimeSelect: (time: Date) => void;
  onCancelTimePicker: () => void;
}

const EmailDetailFullLayout: React.FC<EmailDetailFullLayoutProps> = ({
  animationClass,
  isMobile,
  emailContent,
  showRuleModal,
  customRule,
  onCustomRuleChange,
  onCloseRuleModal,
  onCreateCustomRule,
  showTimePicker,
  scheduledSendAt,
  timeSuggestions,
  timeWarning,
  suggestedTime,
  onTimeSelect,
  onCancelTimePicker,
}) => (
  <>
    <EmailDetailAnimationOverlay animationClass={animationClass} />
    <EmailDetailSidebar />
    <div
      style={{
        height: '100vh',
        backgroundColor: theme.colors.background.default,
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <div
        style={{
          height: '100%',
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: isMobile ? `70px ${theme.spacing.xs} ${theme.spacing.md}` : theme.spacing['2xl'],
        }}
      >
        <div style={{ maxWidth: isMobile ? '100%' : '900px', margin: '0 auto' }}>{emailContent}</div>
      </div>
    </div>
    <CustomRuleModal
      show={showRuleModal}
      customRule={customRule}
      onCustomRuleChange={onCustomRuleChange}
      onClose={onCloseRuleModal}
      onCreate={onCreateCustomRule}
    />
    {showTimePicker && (
      <TimePicker
        selectedTime={scheduledSendAt}
        suggestions={timeSuggestions}
        warning={timeWarning}
        suggestedTime={suggestedTime}
        onTimeSelect={onTimeSelect}
        onCancel={onCancelTimePicker}
      />
    )}
  </>
);

// Extracted to reduce main component line count
const EmailDetailContent: React.FC<any> = ({
  state: st,
  ops,
  scheduledSendAt,
  effectiveVariant,
  isMobile,
  id,
  user,
  replyTextareaRef,
  replyComposerRef,
  handleOpenTimePicker,
  handleClearSchedule,
  onClose,
}) => {
  const isCompactOrInline =
    effectiveVariant === EMAIL_DETAIL_VARIANT_COMPACT || effectiveVariant === EMAIL_DETAIL_VARIANT_INLINE;
  const isInline = effectiveVariant === EMAIL_DETAIL_VARIANT_INLINE;

  const { handleDraftChange, handleReplyOptionSelect, handleReplyClose } = useEmailDetailDraftHandlers(
    st.replyOptions,
    st.setDraft,
    st.setSelectedReplyOption,
    st.setReplyOptions,
    st.setToneCheckResult,
    st.setShowReplyComposer
  );
  const handleSummaryTypeChange = (type: string) => {
    if (type === SUMMARY_TYPE_CUSTOM) {
      st.setShowRuleModal(true);
    } else if (type.startsWith(SUMMARY_TYPE_CUSTOM_PREFIX)) {
      const ruleId = type.replace(SUMMARY_TYPE_CUSTOM_PREFIX, '');
      const rule = st.customRules.find((rule: any) => rule.ruleId === ruleId);
      if (rule) {
        ops.handleUseCustomRule(rule);
      } else {
        console.error('Custom rule not found:', ruleId);
      }
    } else {
      ops.handleSummarize(type);
    }
  };
  return (
    <>
      <EmailDetailNotesAndActions state={st} ops={ops} effectiveVariant={effectiveVariant} isMobile={isMobile} />
      <div style={getEmailContentCardStyle(isCompactOrInline, isMobile)}>
        {/* Header is hidden for inline variant — no router/priority context needed in panel mode */}
        {!isInline && (
          <div style={{ marginBottom: theme.spacing.xl }}>
            <EmailDetailHeader
              email={st.email as any}
              threadEmails={st.threadEmails as Email[]}
              priorityExplanation={st.priorityExplanation}
              showPriorityExplanation={st.showPriorityExplanation}
              onFetchPriorityExplanation={ops.handleFetchPriorityExplanation}
              onClosePriorityExplanation={() => st.setShowPriorityExplanation(false)}
            />
          </div>
        )}
        <EmailDetailActions
          email={st.email as any}
          suggestedActions={st.suggestedActions}
          showQuickActionsMenu={st.showQuickActionsMenu}
          selectedAction={st.selectedAction}
          onShowQuickActionsMenu={() => st.setShowQuickActionsMenu(true)}
          onCloseQuickActionsMenu={() => st.setShowQuickActionsMenu(false)}
          onSelectAction={ops.handleActionSelected}
          onCloseAction={() => st.setSelectedAction(null)}
          onActionSuccess={ops.handleActionSuccess}
          onOpenReplyComposer={ops.handleOpenReplyComposer}
          onArchive={ops.handleArchive}
          onDelete={ops.handleDelete}
          onSetStarCount={ops.handleSetStarCount}
          onBlockSender={ops.handleBlockSender}
          onSnooze={ops.handleSnooze}
          onRespondToInvitation={ops.handleRespondToInvitation}
          onDraftReply={(replyDraft: string) => {
            st.setDraft(replyDraft);
            st.setShowReplyComposer(true);
          }}
          hideActionButtons={isCompactOrInline && !isInline}
        />
        {st.showReplyComposer && (
          <div ref={replyComposerRef}>
            <ReplyComposer
              showReplyComposer={st.showReplyComposer}
              replyMode={st.replyMode}
              replyRecipients={st.replyRecipients}
              replyCc={st.replyCc}
              replyBcc={st.replyBcc}
              showCc={st.showCc}
              showBcc={st.showBcc}
              draft={st.draft}
              replyOptions={st.replyOptions}
              selectedReplyOption={st.selectedReplyOption}
              loadingReplies={st.loadingReplies}
              checkingTone={st.checkingTone}
              toneCheckResult={st.toneCheckResult}
              sending={st.sending}
              textareaRef={replyTextareaRef}
              scheduledSendAt={scheduledSendAt}
              onReplyRecipientsChange={st.setReplyRecipients}
              onCcChange={st.setReplyCc}
              onBccChange={st.setReplyBcc}
              onShowCc={() => st.setShowCc(true)}
              onShowBcc={() => st.setShowBcc(true)}
              onDraftChange={handleDraftChange}
              onReplyOptionSelect={handleReplyOptionSelect}
              onClose={handleReplyClose}
              onSend={(
                files: File[],
                hrs?: number,
                _fwd?: string[],
                draft?: string,
                sched?: Date,
                keepInAction?: boolean
              ) => ops.handleSendReply(files, hrs, draft, sched, keepInAction)}
              onUseRevisedText={(text: string) => {
                st.setDraft(text);
              }}
              onDispute={ops.disputeToneCheck}
              disputing={st.disputing}
              disputeResult={st.disputeResult}
              onSchedule={handleOpenTimePicker}
              onClearSchedule={handleClearSchedule}
              currentEmailId={id}
              currentEmailObjectId={st.email?.id}
              currentEmailThreadId={(st.email as any)?.emailThreadId}
            />
          </div>
        )}
        {/* GitHub + CRM sections: shown in full and inline modes; in compact mode they appear in EmailDetailNotesAndActions above instead */}
        {effectiveVariant !== EMAIL_DETAIL_VARIANT_COMPACT && (
          <>
            <div style={{ marginBottom: theme.spacing.xl }}>
              <GitHubStatusSection
                links={st.githubLinks}
                loading={st.loadingGithub}
                hasToken={st.hasGithubToken}
                onRefresh={ops.refreshGithubInfo}
                emailSubject={st.email?.subject}
                emailBody={st.email?.body}
                emailHtmlBody={st.email?.htmlBody}
              />
            </div>
            <div style={{ marginBottom: theme.spacing.xl }}>
              <CRMDealsSection senderEmail={extractEmailAddress(st.email?.from)} emailSubject={st.email?.subject} />
            </div>
          </>
        )}
        {shouldShowPhishingAlert(st.email?.phishingConfidence) && st.email?.phishingConfidence && (
          <EmailPhishingWarning confidence={st.email.phishingConfidence} reason={st.email.phishingReason ?? ''} />
        )}
        {/* Summary section is omitted in inline variant — panel mode is not a primary reading surface */}
        {!isInline && (
          <SummarySection
            summary={st.summary}
            summaryType={st.summaryType}
            summaryCollapsed={st.summaryCollapsed}
            isGeneratingSummary={st.isGeneratingSummary}
            emailIsProcessingSummary={st.email?.isProcessingSummary}
            customRules={st.customRules}
            onSummaryTypeChange={handleSummaryTypeChange}
            onToggleCollapsed={() => st.setSummaryCollapsed(!st.summaryCollapsed)}
            onShowRuleModal={() => {}}
            onUseCustomRule={ops.handleUseCustomRule}
          />
        )}
        <EmailThreadView
          email={st.email as Email}
          threadEmails={st.threadEmails as Email[]}
          expandedThreadItems={st.expandedThreadItems}
          onToggleThreadItem={ops.toggleThreadItem}
          extractCleanBody={ops.extractCleanBody}
          removeSignature={ops.removeSignature}
          extractCleanHtmlBody={ops.extractCleanHtmlBody}
          sanitizeAndProcessHtml={ops.sanitizeAndProcessHtml}
        />
      </div>
      {user?.isAdmin && st.email && <EmailDetailDebugInfo email={st.email} threadEmails={st.threadEmails} />}
    </>
  );
};

const EmailDetailNotesAndActions: React.FC<any> = ({ state: st, ops, effectiveVariant, isMobile }) => (
  <div style={{ marginBottom: isMobile ? theme.spacing.sm : theme.spacing.xl }}>
    <PrivateNotesSection
      noteContent={st.noteContent}
      notesCollapsed={st.notesCollapsed}
      onNoteContentChange={st.setNoteContent}
      onToggleCollapsed={() => st.setNotesCollapsed(!st.notesCollapsed)}
      onSaveNote={ops.handleSaveNote}
    />
    <ActionItemsSection
      actionItems={st.actionItems}
      newActionItem={st.newActionItem}
      isGeneratingSummary={st.isGeneratingSummary}
      onNewActionItemChange={st.setNewActionItem}
      onAddActionItem={ops.handleAddActionItem}
      onToggleActionItem={ops.handleToggleActionItem}
      onDeleteActionItem={ops.handleDeleteActionItem}
      onExtractActions={ops.handleExtractActions}
      onRegenerateActionItems={ops.handleRegenerateActionItems}
    />
    {/* In compact (split-view) mode, GitHub and CRM go here to match the previous compactMode=true layout */}
    {effectiveVariant === EMAIL_DETAIL_VARIANT_COMPACT && (
      <>
        <GitHubStatusSection
          links={st.githubLinks}
          loading={st.loadingGithub}
          hasToken={st.hasGithubToken}
          onRefresh={ops.refreshGithubInfo}
          emailSubject={st.email?.subject}
          emailBody={st.email?.body}
          emailHtmlBody={st.email?.htmlBody}
        />
        <CRMDealsSection senderEmail={extractEmailAddress(st.email?.from)} emailSubject={st.email?.subject} />
      </>
    )}
  </div>
);
