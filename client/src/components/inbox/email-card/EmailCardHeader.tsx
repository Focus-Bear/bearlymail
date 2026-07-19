import React from 'react';
import { theme } from 'theme/theme';

import { EmailLabels } from 'components/inbox/email-card/EmailLabels';
import { EmailTimestamp } from 'components/inbox/email-card/EmailTimestamp';
import { PriorityBadge } from 'components/inbox/email-card/PriorityBadge';

interface EmailCardHeaderProps {
  from: string;
  fromName?: string;
  isRead: boolean;
  priorityLabel: string;
  priorityColor: string;
  priorityBg: string;
  priorityScore: number;
  isProcessingPriority: boolean;
  urgencyScore?: number;
  urgencyExplanation?: string | null;
  labels?: string[];
  receivedAt: string;
}

/**
 * Email card header component
 * Displays sender, priority, labels, and timestamp
 */
export const EmailCardHeader: React.FC<EmailCardHeaderProps> = ({
  from,
  fromName,
  isRead,
  priorityLabel,
  priorityColor,
  priorityBg,
  priorityScore,
  isProcessingPriority,
  labels,
  receivedAt,
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
      <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.md }}>
        <strong
          style={{
            color: isRead ? theme.colors.text.secondary : theme.colors.text.primary,
            fontSize: theme.typography.fontSize.base,
            fontWeight: isRead ? theme.typography.fontWeight.normal : theme.typography.fontWeight.semibold,
          }}
        >
          {fromName || from}
        </strong>
        <PriorityBadge
          priorityLabel={priorityLabel}
          priorityColor={priorityColor}
          priorityBg={priorityBg}
          priorityScore={priorityScore}
          isProcessingPriority={isProcessingPriority}
        />
        {labels && <EmailLabels labels={labels} />}
      </div>
      <EmailTimestamp receivedAt={receivedAt} />
    </div>
  );
};
