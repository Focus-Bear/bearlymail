import React from 'react';
import { theme } from 'theme/theme';

interface EmailHeaderRightProps {
  receivedAt: string;
}

export const EmailHeaderRight: React.FC<EmailHeaderRightProps> = ({ receivedAt }) => {
  return (
    <span style={{
      fontSize: theme.typography.fontSize.xs,
      color: theme.colors.text.tertiary,
    }}>
      {new Date(receivedAt).toLocaleDateString(undefined, { 
        month: 'short', 
        day: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit' 
      })}
    </span>
  );
};






