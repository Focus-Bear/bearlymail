import React from 'react';
import { theme } from 'theme/theme';
import { Email, PriorityExplanation } from 'types/email';

import { InboxContactTypeBadge } from 'components/crm/InboxContactTypeBadge';
import { EmailLabels } from 'components/inbox/header/EmailLabels';
import { PriorityBadge } from 'components/inbox/header/PriorityBadge';

interface EmailHeaderLeftProps {
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
  onCategoryOverride?: (newCategory: string) => void;
}

export const EmailHeaderLeft: React.FC<EmailHeaderLeftProps> = ({
  email,
  priorityTooltip,
  onOverrideUrgency,
  onProvideFeedback,
  onCategoryOverride,
}) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.md, flex: 1, minWidth: 0 }}>
    {/* Sender name is plain text in the list — clicking it selects the email rather than
        opening the contact. Contact navigation lives in the open/split detail header. */}
    <strong
      style={{
        color: email.isRead ? theme.colors.text.secondary : theme.colors.text.primary,
        fontSize: theme.typography.fontSize.base,
        fontWeight: theme.typography.fontWeight.semibold,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}
    >
      {email.correspondentName || email.correspondentEmail || email.fromName || email.from}
    </strong>

    <InboxContactTypeBadge senderEmail={email.correspondentEmail || email.from} />

    <PriorityBadge
      email={email}
      priorityTooltip={priorityTooltip}
      onOverrideUrgency={onOverrideUrgency}
      onProvideFeedback={onProvideFeedback}
      onCategoryOverride={onCategoryOverride}
    />

    <EmailLabels labels={email.labels || []} />
  </div>
);
