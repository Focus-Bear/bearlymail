import React from 'react';
import { theme } from '../../theme/theme';
import { EmailThreadItem } from './EmailThreadItem';

interface Email {
  id: string;
  from: string;
  fromName?: string;
  body: string;
  htmlBody?: string;
  receivedAt: string;
}

interface EmailThreadListProps {
  threadEmails: Email[];
  currentEmailId: string;
  expandedThreadItems: Set<string>;
  onToggleThreadItem: (id: string) => void;
}

/**
 * Email thread list component
 * Displays all emails in a thread
 */
export const EmailThreadList: React.FC<EmailThreadListProps> = ({
  threadEmails,
  currentEmailId,
  expandedThreadItems,
  onToggleThreadItem,
}) => {
  if (threadEmails.length <= 1) {
    return null;
  }

  return (
    <div style={{ marginBottom: theme.spacing.xl }}>
      <h3
        style={{
          fontSize: theme.typography.fontSize.lg,
          fontWeight: theme.typography.fontWeight.semibold,
          marginBottom: theme.spacing.md,
          color: theme.colors.text.primary,
        }}
      >
        Thread ({threadEmails.length} messages)
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.sm }}>
        {threadEmails.map((threadEmail) => (
          <EmailThreadItem
            key={threadEmail.id}
            threadEmail={threadEmail}
            isExpanded={expandedThreadItems.has(threadEmail.id)}
            isCurrentEmail={threadEmail.id === currentEmailId}
            onToggle={() => onToggleThreadItem(threadEmail.id)}
          />
        ))}
      </div>
    </div>
  );
};

