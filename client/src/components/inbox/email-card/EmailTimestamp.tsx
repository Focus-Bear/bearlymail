import React from 'react';
import { theme } from 'theme/theme';

interface EmailTimestampProps {
  receivedAt: string;
}

export const EmailTimestamp: React.FC<EmailTimestampProps> = ({ receivedAt }) => {
  return (
    <span
      style={{
        fontSize: theme.typography.fontSize.sm,
        color: theme.colors.text.tertiary,
      }}
    >
      {new Date(receivedAt).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })}
    </span>
  );
};
