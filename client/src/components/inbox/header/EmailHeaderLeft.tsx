import React from 'react';
import { theme } from 'theme/theme';
import { Email, PriorityExplanation } from 'types/email';

import { InboxContactTypeBadge } from 'components/crm/InboxContactTypeBadge';
import { EmailLabels } from 'components/inbox/header/EmailLabels';
import { PriorityBadge } from 'components/inbox/header/PriorityBadge';
import { INBOX_HEADER_TEXT_MIN_WIDTH_PX, INBOX_SENDER_PREFERRED_WIDTH_PX } from 'constants/layout';

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
  <div
    style={{
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: theme.spacing.sm,
      flex: 1,
      minWidth: `min(100%, ${INBOX_HEADER_TEXT_MIN_WIDTH_PX}px)`,
    }}
  >
    {/* Sender name is plain text in the list — clicking it selects the email rather than
        opening the contact. Contact navigation lives in the open/split detail header. */}
    <strong
      style={{
        flex: `1 1 ${INBOX_SENDER_PREFERRED_WIDTH_PX}px`,
        minWidth: 0,
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
