import React from 'react';
import { useSelector } from 'react-redux';
import { theme } from 'theme/theme';
import { Email, InboxMode, TriageSuggestion } from 'types/email';

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
import { selectAnimatingOut } from 'store/selectors/emailSelectors';

interface EmailListItemProps {
  email: Email;
  index: number;
  mode: InboxMode;
  isSelected: boolean;
  suggestion: TriageSuggestion | null;
  priorityTooltip: {
    hoveredPriorityEmailId: string | null;
    priorityExplanation: any;
    loadingPriorityExplanation: boolean;
    togglePriorityTooltip: (emailId: string) => void;
    hidePriorityTooltip: () => void;
    expeditePriorityCalculation: (emailId: string) => Promise<void>;
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
  onEmailSelect: (emailId: string, event: React.MouseEvent) => void;
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

export const EmailListItem: React.FC<EmailListItemProps> = ({
  email,
  index,
  mode,
  isSelected,
  suggestion,
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
  const animatingOut = useSelector(selectAnimatingOut);
  const animatingOutItem = animatingOut.find(item => item.id === email.id);

  let animationClass = '';
  if (animatingOutItem?.type === ANIMATION_TYPE_ARCHIVE) {
    animationClass = 'animate-fly-out-right';
  } else if (animatingOutItem?.type === ANIMATION_TYPE_PRIORITY) {
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
      onEmailSelect(email.id, event);
    }
  };

  return (
    <div
      data-email-index={index}
      data-email-id={email.id}
      className={animationClass}
      style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.xs, position: 'relative' }}
    >
      {animatingOutItem?.type === ANIMATION_TYPE_PRIORITY && (
        <div className="priority-emoji-float" aria-hidden="true" />
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
        {mode === MODE_FOLLOW_UP && (
          <FollowUpMetadata email={email as any} />
        )}
        {mode === MODE_FOLLOW_UP && followUpData && (
          <FollowUpDraft
            followUpData={followUpData}
            onUpdateDraft={onUpdateDraft}
            onSendFollowUp={onSendFollowUp}
          />
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
          <GitHubProjectBadges 
            emailId={email.id} 
            initialLinks={email.githubMetadata.links}
            skipFetch
          />
        )}
      </EmailCard>
    </div>
  );
};

