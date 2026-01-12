import React from 'react';
import { theme } from 'theme/theme';
import { Email, InboxMode, TriageSuggestion } from 'types/email';
import { EmailCardHeader } from 'components/inbox/EmailCardHeader';
import { EmailPreview } from 'components/inbox/EmailPreview';
import { EmailActionsRow } from 'components/inbox/EmailActionsRow';
import { EmailCard } from 'components/inbox/EmailCard';
import { EmailSubject } from 'components/inbox/EmailSubject';
import { MetadataIndicators } from 'components/inbox/MetadataIndicators';
import { FollowUpMetadata } from 'components/inbox/FollowUpMetadata';
import { FollowUpDraft } from 'components/inbox/FollowUpDraft';
import { GitHubProjectBadges } from 'components/github/GitHubProjectBadges';

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
  onEmailClick: (emailId: string, index: number, e: React.MouseEvent) => void;
  onEmailSelect: (emailId: string, e: React.MouseEvent) => void;
  onSetStarCount: (emailId: string, starCount: number, e?: React.MouseEvent) => Promise<void>;
  onArchive: (emailId: string, e: React.MouseEvent) => Promise<void>;
  onBlockSender: (emailId: string, e: React.MouseEvent) => void;
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
  const handleCardClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('[data-priority-badge]') || target.closest('[data-priority-tooltip]')) {
      return;
    }
    
    if (e.ctrlKey || e.metaKey || e.shiftKey) {
      onEmailClick(email.id, index, e);
    } else {
      onEmailSelect(email.id, e);
    }
  };

  return (
    <div 
      data-email-index={index}
      data-email-id={email.id}
      style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.xs }}
    >
      <EmailCard email={email} isSelected={isSelected} onCardClick={handleCardClick}>
        <EmailCardHeader 
          email={email} 
          priorityTooltip={priorityTooltip}
          onOverrideUrgency={onOverrideUrgency}
          onProvideFeedback={onProvideFeedback}
        />
        <EmailSubject email={email} />
        <EmailPreview email={email} />
        <MetadataIndicators email={email} />
        {email.githubMetadata?.links && email.githubMetadata.links.length > 0 && (
          <GitHubProjectBadges 
            emailId={email.id} 
            initialLinks={email.githubMetadata.links}
          />
        )}
        {mode === 'follow-up' && (
          <FollowUpMetadata email={email as any} />
        )}
        {mode === 'follow-up' && followUpData && (
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
      </EmailCard>
    </div>
  );
};

