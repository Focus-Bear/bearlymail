import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { theme } from 'theme/theme';
import { Email } from 'types/email';
import { extractEmailAddress, getCorrespondent } from 'utils/emailUtils';
import { captureEvent } from 'utils/posthog';

import { TimePicker } from 'components/compose/TimePicker';
import { CRMDealsSection } from 'components/crm/CRMDealsSection';
import { CardDisplaySettings, CardDisplaySettingsButton } from 'components/email-detail/CardDisplaySettings';
import { CustomRuleModal } from 'components/email-detail/CustomRuleModal';
import { EmailDetailActions } from 'components/email-detail/EmailDetailActions';
import { EmailDetailAnimationOverlay } from 'components/email-detail/EmailDetailAnimationOverlay';
import { EmailDetailDebugInfo } from 'components/email-detail/EmailDetailDebugInfo';
import { EmailDetailHeader } from 'components/email-detail/EmailDetailHeader';
import { EmailDetailSidebar } from 'components/email-detail/EmailDetailSidebar';
import { EmailPhishingWarning } from 'components/email-detail/EmailPhishingWarning';
import { shouldShowPhishingAlert } from 'components/email-detail/emailPhishingWarning.helpers';
import { EmailSchedulingCards } from 'components/email-detail/EmailSchedulingCards';
import { EmailThreadView } from 'components/email-detail/EmailThreadView';
import { SenderContextSection } from 'components/email-detail/SenderContextSection';
import { SummarySection } from 'components/email-detail/SummarySection';
import { ActionItemsSection } from 'components/email-detail-inline/ActionItemsSection';
import { EmailNotFound } from 'components/email-detail-inline/EmailNotFound';
import { LoadingSpinner } from 'components/email-detail-inline/LoadingSpinner';
import { PrivateNotesSection } from 'components/email-detail-inline/PrivateNotesSection';
import { ReplyComposer } from 'components/email-detail-inline/ReplyComposer';
import { GitHubStatusSection } from 'components/github/GitHubStatusSection';
import { ActionSidebar } from 'components/inbox/ActionSidebar';
import { AskAiPanel } from 'components/inbox/AskAiPanel';
import { SuggestedAction } from 'components/quick-actions/QuickActionsMenu';
import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import {
  ACTION_TYPE_CALENDAR_CREATE_INVITE,
  ACTION_TYPE_GITHUB_ADD_COMMENT,
  ACTION_TYPE_GITHUB_CREATE_ISSUE,
  ACTION_TYPE_GITHUB_SEARCH_ISSUES,
  ACTION_TYPE_GITHUB_UPDATE_STATUS,
  ACTION_TYPE_SCHEDULING_REQUEST,
  REPLY_MODE_FORWARD,
  SUMMARY_TYPE_CUSTOM,
  SUMMARY_TYPE_CUSTOM_PREFIX,
} from 'constants/strings';
import { useAuth } from 'contexts/AuthContext';
import { CardType, useCardVisibilityPreferences } from 'hooks/useCardVisibilityPreferences';
import { useDebugViewOpen } from 'hooks/useDebugViewOpen';
import { useEmailDetailDraftHandlers } from 'hooks/useEmailDetailDraftHandlers';
import { useEmailDetailDraftSync } from 'hooks/useEmailDetailDraftSync';
import { useEmailDetailInitialization } from 'hooks/useEmailDetailInitialization';
import { useEmailDetailOperations } from 'hooks/useEmailDetailOperations';
import { useEmailDetailState } from 'hooks/useEmailDetailState';
import { useEmailDetailTimePicker } from 'hooks/useEmailDetailTimePicker';
import { useResponsiveBreakpoints } from 'hooks/useResponsiveBreakpoints';
import { TimeSuggestion } from 'hooks/useScheduledEmails';

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

// Module-level constants: stable across renders, no need to include in useMemo deps.
const GITHUB_ACTION_TYPES = new Set<string>([
  ACTION_TYPE_GITHUB_ADD_COMMENT,
  ACTION_TYPE_GITHUB_CREATE_ISSUE,
  ACTION_TYPE_GITHUB_SEARCH_ISSUES,
  ACTION_TYPE_GITHUB_UPDATE_STATUS,
]);

// Scheduling/calendar action types that belong in SchedulingRequestCard, not QuickActionsSection.
// Both types are included because the LLM sometimes returns calendar_create_invite for the same
// scheduling intent — keeping them here prevents duplication in the Quick Actions dropdown.
const SCHEDULING_ACTION_TYPES = new Set<string>([ACTION_TYPE_SCHEDULING_REQUEST, ACTION_TYPE_CALENDAR_CREATE_INVITE]);

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

const EmailDetailNotFoundScreen: React.FC<{ isInline: boolean; notFoundText: string }> = ({
  isInline,
  notFoundText,
}) => {
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
      loadPriorityExplanation: ops.loadPriorityExplanation,
      handleUseCustomRule: ops.handleUseCustomRule,
      handleSummarize: ops.handleSummarize,
      setSummary: state.setSummary,
      setSummaryType: state.setSummaryType,
      setSummaryDebug: state.setSummaryDebug,
      setSummaryCollapsed: state.setSummaryCollapsed,
      setActionItems: state.setActionItems,
      setExpandedThreadItems: state.setExpandedThreadItems,
      setThreadEmails: state.setThreadEmails,
      setPriorityExplanation: state.setPriorityExplanation,
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
        getStarCount: () => email?.starCount ?? 0,
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

    // Compact (split-view): EmailDetailContent returns its own two-column layout
    // (email body + action sidebar), so render it directly into a full-height column.
    if (isCompact) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', position: 'relative' }}>
          {emailContent}
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

    // Inline (drawer/panel): single scrolling column, no sidebar.
    if (isInline) {
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
  timeSuggestions: TimeSuggestion[];
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

type EmailDetailStateType = ReturnType<typeof useEmailDetailState>;
type EmailDetailOpsType = ReturnType<typeof useEmailDetailOperations>;

interface EmailDetailContentProps {
  state: EmailDetailStateType;
  ops: EmailDetailOpsType;
  scheduledSendAt: Date | null;
  effectiveVariant: string;
  isMobile: boolean;
  id: string | undefined;
  user: ReturnType<typeof useAuth>['user'];
  replyTextareaRef: React.RefObject<HTMLTextAreaElement | null>;
  replyComposerRef: React.RefObject<HTMLDivElement | null>;
  handleOpenTimePicker: () => void;
  handleClearSchedule: () => void;
  onClose?: () => void;
}

interface EmailDetailNotesAndActionsProps {
  isMobile: boolean;
  hiddenCards: Set<CardType>;
  onHideCard: (card: CardType) => void;
  showCardSettings: boolean;
  onToggleCardSettings: () => void;
  onCloseCardSettings: () => void;
  onShowCard: (card: CardType) => void;
  /** Notes/tasks cards, rendered here unless they have been moved to the action sidebar. */
  notesSection?: React.ReactNode;
  tasksSection?: React.ReactNode;
  /** When true, notes/tasks live in the action sidebar (split-view), so skip them here. */
  assistantInSidebar?: boolean;
}

// Extracted to reduce main component line count
const EmailDetailContent: React.FC<EmailDetailContentProps> = ({
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
  const { debugViewOpen } = useDebugViewOpen();
  // Admin debug surfaces only appear once the bug icon has enabled debug mode.
  const showAdminDebug = !!user?.isAdmin && debugViewOpen;
  const isCompactOrInline =
    effectiveVariant === EMAIL_DETAIL_VARIANT_COMPACT || effectiveVariant === EMAIL_DETAIL_VARIANT_INLINE;
  const isInline = effectiveVariant === EMAIL_DETAIL_VARIANT_INLINE;
  // Split-view (compact) hosts the assistant cards in a dedicated right-hand sidebar.
  const isCompact = effectiveVariant === EMAIL_DETAIL_VARIANT_COMPACT;

  const { hiddenCards, hideCard, showCard } = useCardVisibilityPreferences();
  const [showCardSettings, setShowCardSettings] = useState(false);

  const { handleDraftChange, handleReplyOptionSelect, handleReplyClose } = useEmailDetailDraftHandlers({
    replyOptions: st.replyOptions,
    setDraft: st.setDraft,
    setSelectedReplyOption: st.setSelectedReplyOption,
    setReplyOptions: st.setReplyOptions,
    setToneCheckResult: st.setToneCheckResult,
    setShowReplyComposer: st.setShowReplyComposer,
  });

  // Opens the composer targeting an earlier thread message, then scrolls it into view.
  // Depends on the memoized handler (not the whole `ops` object) so this callback stays
  // reference-stable and doesn't defeat EmailThreadView's React.memo on every keystroke.
  const { handleOpenReplyComposer } = ops;
  const handleReplyToMessage = useCallback(
    (targetEmailId: string, mode: 'reply' | 'replyAll' | 'forward') => {
      handleOpenReplyComposer(mode, targetEmailId);
      setTimeout(() => {
        replyComposerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        replyTextareaRef.current?.focus();
      }, 100);
    },
    [handleOpenReplyComposer, replyComposerRef, replyTextareaRef]
  );

  // The thread message the composer is acting on (an earlier message when the user
  // replied/forwarded from the thread list, otherwise the opened message).
  const replyTargetEmail = st.replyTargetEmailId
    ? st.threadEmails.find(threadMsg => threadMsg.id === st.replyTargetEmailId) ?? st.email
    : st.email;

  // Partition suggested actions into three buckets:
  //   githubActions    → GitHubStatusSection → GitHubLinkCard (fixed by #819)
  //   schedulingActions → EmailDetailActions → SchedulingRequestCard (#807)
  //   otherActions     → EmailDetailActions → QuickActionsSection
  // Constants are defined at module level — stable references, no deps needed.
  const { githubActions, schedulingActions, otherActions } = useMemo(() => {
    const all = st.suggestedActions ?? [];
    return {
      githubActions: all.filter(action => GITHUB_ACTION_TYPES.has(action.type)),
      schedulingActions: all.filter(action => SCHEDULING_ACTION_TYPES.has(action.type)),
      otherActions: all.filter(
        action => !GITHUB_ACTION_TYPES.has(action.type) && !SCHEDULING_ACTION_TYPES.has(action.type)
      ),
    };
  }, [st.suggestedActions]);

  const emailContext = st.email
    ? {
        subject: st.email.subject,
        body: st.email.body,
        from: st.email.from,
        fromName: st.email.fromName,
      }
    : null;

  const handleSummaryTypeChange = (type: string) => {
    if (type === SUMMARY_TYPE_CUSTOM) {
      st.setShowRuleModal(true);
    } else if (type.startsWith(SUMMARY_TYPE_CUSTOM_PREFIX)) {
      const ruleId = type.replace(SUMMARY_TYPE_CUSTOM_PREFIX, '');
      const rule = st.customRules.find(rule => rule.ruleId === ruleId);
      if (rule) {
        ops.handleUseCustomRule(rule);
      } else {
        console.error('Custom rule not found:', ruleId);
      }
    } else {
      ops.handleSummarize(type);
    }
  };

  // Card-visibility cog. In full/inline views it renders above the inline cards (inside
  // EmailDetailNotesAndActions); in split-view the cards move to the sidebar, so the cog
  // travels with them and is rendered at the top of the Actions tab there.
  const cardSettingsControl = (
    <div style={{ position: 'relative', display: 'flex', justifyContent: 'flex-end', marginBottom: theme.spacing.xs }}>
      <span onMouseDown={event => event.stopPropagation()}>
        <CardDisplaySettingsButton onClick={() => setShowCardSettings(prev => !prev)} />
      </span>
      <CardDisplaySettings
        hiddenCards={hiddenCards}
        onShowCard={showCard}
        onHideCard={hideCard}
        isOpen={showCardSettings}
        onClose={() => setShowCardSettings(false)}
      />
    </div>
  );

  // Assistant cards (summary / tasks / notes) are built once and rendered either
  // inline (full/inline views) or inside the split-view ActionSidebar (compact).
  const notesSection = !hiddenCards.has('privateNotes') ? (
    <PrivateNotesSection
      noteContent={st.noteContent}
      notesCollapsed={st.notesCollapsed}
      onNoteContentChange={st.setNoteContent}
      onToggleCollapsed={() => st.setNotesCollapsed(!st.notesCollapsed)}
      onSaveNote={ops.handleSaveNote}
      onDismiss={() => hideCard('privateNotes')}
    />
  ) : null;

  const tasksSection = !hiddenCards.has('actionItems') ? (
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
      onDismiss={() => hideCard('actionItems')}
    />
  ) : null;

  const summarySection =
    !isInline && !hiddenCards.has('summary') ? (
      <SummarySection
        summary={st.summary}
        summaryType={st.summaryType}
        summaryCollapsed={st.summaryCollapsed}
        isGeneratingSummary={st.isGeneratingSummary}
        emailIsProcessingSummary={st.email?.isProcessingSummary}
        customRules={st.customRules}
        summaryDebug={st.summaryDebug}
        showDebug={showAdminDebug}
        onSummaryTypeChange={handleSummaryTypeChange}
        onToggleCollapsed={() => st.setSummaryCollapsed(!st.summaryCollapsed)}
        onShowRuleModal={() => {}}
        onUseCustomRule={ops.handleUseCustomRule}
        onDismiss={() => hideCard('summary')}
      />
    ) : null;

  // Scheduling/calendar card (ICS invite, scheduling request, or accept/decline).
  // In split-view this lives in the action sidebar; in full/inline it stays inline
  // inside EmailDetailActions, so this node is only consumed in compact mode.
  const schedulingSection = st.email ? (
    <EmailSchedulingCards
      email={st.email}
      schedulingActions={schedulingActions}
      loadingSchedulingActions={st.loadingSuggestedActions}
      onDraftReply={(replyDraft: string) => {
        st.setDraft(replyDraft);
        st.setShowReplyComposer(true);
      }}
      onRespondToInvitation={ops.handleRespondToInvitation}
    />
  ) : null;

  // Contextual cards (GitHub status, CRM deals, sender history). Rendered inline in
  // full/inline views; in split-view they move to the action sidebar.
  const contextCardsSection = (
    <>
      {!hiddenCards.has('github') && (
        <div style={{ marginBottom: theme.spacing.xl }}>
          <GitHubStatusSection
            links={st.githubLinks}
            loading={st.loadingGithub}
            hasToken={st.hasGithubToken}
            onRefresh={ops.refreshGithubInfo}
            emailSubject={st.email?.subject}
            emailBody={st.email?.body}
            emailHtmlBody={st.email?.htmlBody}
            email={emailContext}
            suggestedGitHubActions={githubActions}
            onDismiss={() => hideCard('github')}
          />
        </div>
      )}
      {!hiddenCards.has('crm') && (
        <div style={{ marginBottom: theme.spacing.xl }}>
          <CRMDealsSection
            senderEmail={extractEmailAddress(st.email?.from)}
            emailSubject={st.email?.subject}
            onDismiss={() => hideCard('crm')}
          />
        </div>
      )}
      {!hiddenCards.has('senderContext') && (
        <div style={{ marginBottom: theme.spacing.xl }}>
          <SenderContextSection
            senderEmail={extractEmailAddress(st.email?.from)}
            onDismiss={() => hideCard('senderContext')}
          />
        </div>
      )}
    </>
  );

  const mainContent = (
    <>
      <EmailDetailNotesAndActions
        isMobile={isMobile}
        hiddenCards={hiddenCards}
        onHideCard={hideCard}
        showCardSettings={showCardSettings}
        onToggleCardSettings={() => setShowCardSettings(prev => !prev)}
        onCloseCardSettings={() => setShowCardSettings(false)}
        onShowCard={showCard}
        notesSection={notesSection}
        tasksSection={tasksSection}
        assistantInSidebar={isCompact}
      />
      <div style={getEmailContentCardStyle(isCompactOrInline, isMobile)}>
        {/* Header is hidden for inline variant — no router/priority context needed in panel mode */}
        {!isInline && (
          <div style={{ marginBottom: theme.spacing.xl }}>
            {st.email && (
              <EmailDetailHeader
                email={st.email}
                threadEmails={st.threadEmails as Email[]}
                priorityExplanation={st.priorityExplanation}
                onFetchPriorityExplanation={ops.handleFetchPriorityExplanation}
              />
            )}
          </div>
        )}
        {st.email && (
          <EmailDetailActions
            email={st.email}
            threadEmails={st.threadEmails as Email[]}
            suggestedActions={otherActions}
            schedulingActions={schedulingActions}
            loadingSchedulingActions={st.loadingSuggestedActions}
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
            hideSchedulingCards={isCompact}
          />
        )}
        {st.showReplyComposer && (
          <div ref={replyComposerRef}>
            <ReplyComposer
              showReplyComposer={st.showReplyComposer}
              replyMode={st.replyMode}
              replyRecipients={st.replyRecipients}
              replyCc={st.replyCc}
              replyBcc={st.replyBcc}
              replySubject={st.replySubject}
              showCc={st.showCc}
              showBcc={st.showBcc}
              draft={st.draft}
              replyOptions={st.replyOptions}
              selectedReplyOption={st.selectedReplyOption}
              loadingReplies={st.loadingReplies}
              checkingTone={st.checkingTone}
              toneCheckResult={st.toneCheckResult}
              sending={st.sending}
              initialAttachments={st.replyMode === REPLY_MODE_FORWARD ? replyTargetEmail?.attachments : undefined}
              textareaRef={replyTextareaRef}
              scheduledSendAt={scheduledSendAt}
              onReplyRecipientsChange={st.setReplyRecipients}
              onCcChange={st.setReplyCc}
              onBccChange={st.setReplyBcc}
              onSubjectChange={st.setReplySubject}
              onShowCc={() => st.setShowCc(true)}
              onShowBcc={() => st.setShowBcc(true)}
              onDraftChange={handleDraftChange}
              onReplyOptionSelect={handleReplyOptionSelect}
              onGenerateFromPrompt={ops.generateFromCustomPrompt}
              generatingFromPrompt={ops.generatingFromCustomPrompt}
              onClose={handleReplyClose}
              onSend={params =>
                ops.handleSendReply({
                  files: params.files,
                  expectedReplyHours: params.expectedReplyHours,
                  expectedReplyDuration: params.expectedReplyDuration,
                  forwardAttachmentIds: params.forwardAttachmentIds,
                  draftOverride: params.draftOverride,
                  scheduledSendAt: params.scheduledSendAt,
                  keepInAction: params.keepInAction,
                  inlineImages: params.inlineImages,
                })
              }
              onUseRevisedText={(text: string) => {
                st.setDraft(text);
              }}
              onDispute={async (emailText: string, _suggestions: string[], argument: string) => {
                await ops.disputeToneCheck(emailText, argument);
                return null;
              }}
              disputing={st.disputing}
              disputeResult={st.disputeResult}
              autoSendCountdown={st.autoSendCountdown}
              onCancelAutoSend={ops.cancelAutoSend}
              onSendNow={ops.handleSendReply}
              onInlineImagesChange={ops.setReplyInlineImages}
              onFilesChange={ops.setReplyFiles}
              onForwardAttachmentIdsChange={ops.setReplyForwardAttachmentIds}
              onDismissToneCheck={() => st.setToneCheckResult(null)}
              onSchedule={handleOpenTimePicker}
              onClearSchedule={handleClearSchedule}
              currentEmailId={id}
              currentEmailObjectId={st.email?.id}
              currentEmailThreadId={st.email?.emailThreadId}
            />
          </div>
        )}
        {/* Contextual cards: shown inline in full and inline modes; in split-view they move to the action sidebar instead. */}
        {!isCompact && contextCardsSection}
        {shouldShowPhishingAlert(st.email?.phishingConfidence) && st.email?.phishingConfidence && (
          <EmailPhishingWarning confidence={st.email.phishingConfidence} reason={st.email.phishingReason ?? ''} />
        )}
        {/* Summary renders here for full view; in split-view it moves to the action sidebar.
            It is always omitted in inline variant (summarySection is null there). */}
        {!isCompact && summarySection}
        <EmailThreadView
          email={st.email as Email}
          threadEmails={st.threadEmails as Email[]}
          expandedThreadItems={st.expandedThreadItems}
          onToggleThreadItem={ops.toggleThreadItem}
          onReplyToMessage={handleReplyToMessage}
          extractCleanBody={ops.extractCleanBody}
          removeSignature={ops.removeSignature}
          extractCleanHtmlBody={ops.extractCleanHtmlBody}
          sanitizeAndProcessHtml={ops.sanitizeAndProcessHtml}
          extractCleanHtmlBodyWithMeta={ops.extractCleanHtmlBodyWithMeta}
          extractCleanBodyWithMeta={ops.extractCleanBodyWithMeta}
        />
      </div>
      {showAdminDebug && st.email && (
        <EmailDetailDebugInfo
          email={st.email}
          threadEmails={st.threadEmails}
          onAttachmentsSynced={async () => {
            await ops.fetchEmail();
            await ops.fetchThreadEmails();
          }}
          githubLinks={st.githubLinks}
          loadingGithub={st.loadingGithub}
          hasGithubToken={st.hasGithubToken}
        />
      )}
    </>
  );

  // Split-view: email body on the left, collapsible assistant sidebar on the right.
  if (isCompact) {
    return (
      <div style={{ display: 'flex', flex: 1, minHeight: 0, width: '100%', overflow: 'hidden' }}>
        <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', overflowX: 'hidden', padding: theme.spacing.sm }}>
          {mainContent}
        </div>
        <ActionSidebar
          actionsContent={
            <>
              {cardSettingsControl}
              {schedulingSection}
              {summarySection}
              {tasksSection}
              {notesSection}
              {contextCardsSection}
            </>
          }
          askAiContent={<AskAiPanel emailId={st.email?.id} />}
        />
      </div>
    );
  }

  return mainContent;
};

const EmailDetailNotesAndActions: React.FC<EmailDetailNotesAndActionsProps> = ({
  isMobile,
  hiddenCards,
  onHideCard,
  showCardSettings,
  onToggleCardSettings,
  onCloseCardSettings,
  onShowCard,
  notesSection = null,
  tasksSection = null,
  assistantInSidebar = false,
}) => {
  // In split-view the cog and the notes/tasks cards live in the action sidebar instead,
  // so this inline block has nothing to render.
  if (assistantInSidebar) {
    return null;
  }
  return (
    <div style={{ marginBottom: isMobile ? theme.spacing.sm : theme.spacing.xl }}>
      <div style={{ position: 'relative', display: 'flex', justifyContent: 'flex-end', marginBottom: theme.spacing.xs }}>
        <span onMouseDown={event => event.stopPropagation()}>
          <CardDisplaySettingsButton onClick={onToggleCardSettings} />
        </span>
        <CardDisplaySettings
          hiddenCards={hiddenCards}
          onShowCard={onShowCard}
          onHideCard={onHideCard}
          isOpen={showCardSettings}
          onClose={onCloseCardSettings}
        />
      </div>
      {notesSection}
      {tasksSection}
    </div>
  );
};
