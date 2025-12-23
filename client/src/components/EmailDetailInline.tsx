import React from 'react';
import { theme } from '../theme/theme';
import { useEmailDetail } from '../hooks/useEmailDetail';
import { EmailDetailHeader, EmailDetailBody, EmailThreadList } from './email-detail';

interface EmailDetailInlineProps {
  emailId: string;
  onClose?: () => void;
}

/**
 * Email detail inline component
 * Displays email details in an inline view
 */
export const EmailDetailInline: React.FC<EmailDetailInlineProps> = ({ emailId }) => {
  const { email, threadEmails, expandedThreadItems, loading, toggleThreadItem } =
    useEmailDetail(emailId);

  if (loading) {
    return (
      <div style={{ padding: theme.spacing.xl, textAlign: 'center' }}>
        <div
          style={{
            width: '24px',
            height: '24px',
            border: `2px solid ${theme.colors.border.light}`,
            borderTop: `2px solid ${theme.colors.primary.main}`,
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto',
          }}
        />
      </div>
    );
  }

  if (!email) {
    return (
      <div style={{ padding: theme.spacing.xl, textAlign: 'center' }}>
        <p style={{ color: theme.colors.text.secondary }}>Email not found</p>
      </div>
    );
  }

  return (
    <div style={{ padding: theme.spacing.xl, height: '100%', overflowY: 'auto' }}>
      <EmailDetailHeader
        emailId={emailId}
        subject={email.subject}
        from={email.from}
        fromName={email.fromName}
        receivedAt={email.receivedAt}
      />

      <EmailThreadList
        threadEmails={threadEmails}
        currentEmailId={emailId}
        expandedThreadItems={expandedThreadItems}
        onToggleThreadItem={toggleThreadItem}
      />

      <EmailDetailBody body={email.body} htmlBody={email.htmlBody} />
    </div>
  );
};




