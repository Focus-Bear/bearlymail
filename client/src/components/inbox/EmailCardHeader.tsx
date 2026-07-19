import React from 'react';
import { theme } from 'theme/theme';
import { Email, PriorityExplanation } from 'types/email';

import { EmailHeaderLeft } from 'components/inbox/header/EmailHeaderLeft';
import { EmailHeaderRight } from 'components/inbox/header/EmailHeaderRight';

interface EmailCardHeaderProps {
  email: Email;
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
  onOverrideUrgency?: () => void;
  onProvideFeedback?: () => void;
}

export const EmailCardHeader: React.FC<EmailCardHeaderProps> = ({
  email,
  priorityTooltip,
  onOverrideUrgency,
  onProvideFeedback,
}) => {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: theme.spacing.xs,
      }}
    >
      <EmailHeaderLeft
        email={email}
        priorityTooltip={priorityTooltip}
        onOverrideUrgency={onOverrideUrgency}
        onProvideFeedback={onProvideFeedback}
      />
      <EmailHeaderRight email={email} />
    </div>
  );
};
