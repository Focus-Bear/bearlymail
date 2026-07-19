import React from 'react';
import { theme } from 'theme/theme';
import { Email } from 'types/email';

interface EmailSubjectProps {
  email: Email;
}

export const EmailSubject: React.FC<EmailSubjectProps> = ({ email }) => {
  return (
    <div
      style={{
        color: email.isRead ? theme.colors.text.secondary : theme.colors.text.primary,
        fontSize: theme.typography.fontSize.lg,
        fontWeight: email.isRead ? theme.typography.fontWeight.normal : theme.typography.fontWeight.bold,
        marginBottom: theme.spacing.sm,
        minWidth: 0,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}
    >
      {email.subject}
    </div>
  );
};
