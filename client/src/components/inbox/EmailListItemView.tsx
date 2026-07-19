/**
 * EmailListItemView — presentational component extracted from EmailListItem.
 *
 * Accepts `isAnimatingOut` and `animationType` as props instead of reading from Redux,
 * making it directly importable in Storybook without a Redux store.
 *
 * The container `EmailListItem` reads `selectAnimatingOut` from the store and
 * passes the derived values down.
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { Email, InboxMode, PriorityExplanation, TriageSuggestion } from 'types/email';

import { GitHubProjectBadges } from 'components/github/GitHubProjectBadges';
import { EmailActionsRow } from 'components/inbox/EmailActionsRow';
import { EmailCard } from 'components/inbox/EmailCard';
import { EmailCardHeader } from 'components/inbox/EmailCardHeader';
import { EmailPreview } from 'components/inbox/EmailPreview';
import { EmailSubject } from 'components/inbox/EmailSubject';
import { FollowUpDraft } from 'components/inbox/FollowUpDraft';
import { FollowUpMetadata } from 'components/inbox/FollowUpMetadata';
import { MetadataIndicators } from 'components/inbox/MetadataIndicators';
import { ANIMATION_TYPE_ARCHIVE, ANIMATION_TYPE_PRIORITY, MODE_FOLLOW_UP } from 'constants/strings';

export interface EmailListItemViewProps {
  email: Email;
  index: number;
  mode: InboxMode;
  isSelected: boolean;
  suggestion: TriageSuggestion | null;
  /** Derived from Redux selectAnimatingOut — null when not animating */
  animatingOutType: typeof ANIMATION_TYPE_ARCHIVE | typeof ANIMATION_TYPE_PRIORITY | null;
  /** Star count from the animating-out transition (used for the destination label) */
  animatingOutStarCount?: number;
  priorityTooltip: {
    hoveredPriorityEmailId: string | null;
    priorityExplanation: PriorityExplanation | null;
    loadingPriorityExplanation: boolean;
    priorityExplanationError: boolean;
    togglePriorityTooltip: (emailId: string) => void;
    hidePriorityTooltip: () => void;
    expeditePriorityCalculation: (emailId: string) => Promise<void>;
    retryPriorityExplanation: (emailId: string) => Promise<void>;
  };
  keyboardHint: {
    showHint: (emailId: string, action: string) => void;
    hideHint: () => void;
  };
  snoozeInput: {
    showSnoozeInput: string | null;
    getSnoozeValue: (emailId: string) => string;
    setSnoozeValue: (emailId: string, value: string) => void;
    showSnooze: (emailId: string) => void;
    clearSnooze: (emailId: string) => void;
  };
  onEmailClick: (emailId: string, index: number, event: React.MouseEvent) => void;
  onEmailSelect: (emailId: string, event: React.MouseEvent | KeyboardEvent, index?: number) => void;
  onSetStarCount: (emailId: string, starCount: number, event?: React.MouseEvent) => Promise<void>;
  onArchive: (emailId: string, event: React.MouseEvent) => Promise<void>;
  onBlockSender: (emailId: string, event: React.MouseEvent) => void;
  onSnooze: (emailId: string) => Promise<void>;
  onOverrideUrgency?: () => void;
  onProvideFeedback?: () => void;
  followUpData?: {
    id: string;
    draftFollowUp: string | null;
    generationStatus: 'pending' | 'generating' | 'completed' | 'error' | null;
    generationError: string | null;
    sendStatus: 'pending' | 'sending' | 'sent' | 'failed' | null;
    sendError: string | null;
  } | null;
  onUpdateDraft?: (followUpId: string, draft: string) => Promise<void>;
  onSendFollowUp?: (followUpId: string, draft: string) => Promise<void>;
  recipientName?: string;
}

export const EmailListItemView: React.FC<EmailListItemViewProps> = ({
  email,
  index,
  mode,
  isSelected,
  suggestion,
  animatingOutType,
  animatingOutStarCount,
  priorityTooltip,
  keyboardHint,
  snoozeInput,
  onEmailClick,
  onEmailSelect,
  onSetStarCount,
  onArchive,
  onBlockSender,
  onSnooze,
  onOverrideUrgency,
  onProvideFeedback,
  followUpData,
  onUpdateDraft,
  onSendFollowUp,
  recipientName,
}) => {
  const { t } = useTranslation();

  let animationClass = '';
  if (animatingOutType === ANIMATION_TYPE_ARCHIVE) {
    animationClass = 'animate-fly-out-right';
  } else if (animatingOutType === ANIMATION_TYPE_PRIORITY) {
    animationClass = 'animate-priority-out';
  }

  const handleCardClick = (event: React.MouseEvent) => {
    const target = event.target as HTMLElement;
    if (target.closest('[data-priority-badge]') || target.closest('[data-priority-tooltip]')) {
      return;
    }

    if (event.ctrlKey || event.metaKey || event.shiftKey) {
      onEmailClick(email.id, index, event);
    } else {
      onEmailSelect(email.id, event, index);
    }
  };

  return (
    <div
      data-email-index={index}
      data-email-id={email.id}
      className={animationClass}
      style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.xs, position: 'relative', minWidth: 0 }}
    >
      {animatingOutType === ANIMATION_TYPE_PRIORITY && (
        <>
          <div className="priority-emoji-float" aria-hidden="true" />
          <div className="priority-destination-label" aria-hidden="true">
            {animatingOutStarCount === 2 ? t('inbox.triage.movingToFollowUp') : t('inbox.triage.movingToAction')}
          </div>
        </>
      )}
      <EmailCard email={email} isSelected={isSelected} onCardClick={handleCardClick} mode={mode}>
        <EmailCardHeader
          email={email}
          priorityTooltip={priorityTooltip}
          onOverrideUrgency={onOverrideUrgency}
          onProvideFeedback={onProvideFeedback}
        />
        <EmailSubject email={email} />
        <EmailPreview email={email} />
        <MetadataIndicators email={email} />
        {mode === MODE_FOLLOW_UP && <FollowUpMetadata email={email} />}
        {mode === MODE_FOLLOW_UP && followUpData && (
          <FollowUpDraft followUpData={followUpData} onUpdateDraft={onUpdateDraft} onSendFollowUp={onSendFollowUp} />
        )}
        <EmailActionsRow
          email={email}
          mode={mode}
          suggestion={suggestion}
          keyboardHint={keyboardHint}
          snoozeInput={snoozeInput}
          onSetStarCount={onSetStarCount}
          onArchive={onArchive}
          onBlockSender={onBlockSender}
          onSnooze={onSnooze}
        />
        {email.githubMetadata?.links && email.githubMetadata.links.length > 0 && (
          <GitHubProjectBadges emailId={email.id} initialLinks={email.githubMetadata.links} skipFetch />
        )}
      </EmailCard>
    </div>
  );
};
