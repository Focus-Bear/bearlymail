import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { EmailThreadItem } from 'components/email-detail/EmailThreadItem';

interface Email {
  id: string;
  from: string;
  fromName?: string;
  to?: string;
  cc?: string;
  body: string;
  htmlBody?: string;
  receivedAt: string;
  attachments?: Array<{
    attachmentId: string;
    filename: string;
    mimeType: string;
    size: number;
  }>;
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
  const { t } = useTranslation();
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
        {t('emailDetail.thread')} ({threadEmails.length}{' '}
        {threadEmails.length === 1 ? t('emailDetail.message') : t('emailDetail.messages')})
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.sm }}>
        {threadEmails.map(threadEmail => (
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
