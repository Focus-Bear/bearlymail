import React from 'react';
import { theme } from 'theme/theme';
import { Email } from 'types/email';
import { PriorityBadge } from 'components/inbox/header/PriorityBadge';
import { UrgencyIndicator } from 'components/inbox/header/UrgencyIndicator';
import { EmailLabels } from 'components/inbox/header/EmailLabels';
import { GitHubStatusBadges } from 'components/github/GitHubStatusBadges';

interface EmailHeaderLeftProps {
  email: Email;
  priorityTooltip: {
    hoveredPriorityEmailId: string | null;
    priorityExplanation: any;
    loadingPriorityExplanation: boolean;
    togglePriorityTooltip: (emailId: string) => void;
    hidePriorityTooltip: () => void;
    expeditePriorityCalculation: (emailId: string) => Promise<void>;
  };
  onOverrideUrgency?: () => void;
  onProvideFeedback?: () => void;
}

export const EmailHeaderLeft: React.FC<EmailHeaderLeftProps> = ({
  email,
  priorityTooltip,
  onOverrideUrgency,
  onProvideFeedback,
}) => {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.md }}>
      <strong style={{
        color: email.isRead ? theme.colors.text.secondary : theme.colors.text.primary,
        fontSize: theme.typography.fontSize.base,
        fontWeight: theme.typography.fontWeight.semibold,
      }}>
        {email.fromName || email.from}
      </strong>
      
      <PriorityBadge
        email={email}
        priorityTooltip={priorityTooltip}
        onOverrideUrgency={onOverrideUrgency}
        onProvideFeedback={onProvideFeedback}
      />

      <UrgencyIndicator
        urgencyScore={email.urgencyScore}
        urgencyExplanation={email.urgencyExplanation}
      />
      
      <EmailLabels labels={email.labels || []} />

      <GitHubStatusBadges links={email.githubMetadata?.links || []} />
    </div>
  );
};






