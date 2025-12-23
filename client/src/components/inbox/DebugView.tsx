import React from 'react';
import { theme } from '../../theme/theme';
import { Email } from '../../types/email';

interface DebugViewProps {
  emails: Email[];
}

export const DebugView: React.FC<DebugViewProps> = ({ emails }) => {
  return (
    <div style={{ padding: theme.spacing.md, borderTop: `1px solid ${theme.colors.border.light}`, marginTop: theme.spacing.xl }}>
      <details>
        <summary style={{ cursor: 'pointer', color: theme.colors.text.secondary }}>Debug View</summary>
        <pre style={{ 
          backgroundColor: theme.colors.background.subtle, 
          padding: theme.spacing.md, 
          borderRadius: theme.borderRadius.md,
          fontSize: '12px',
          overflow: 'auto'
        }}>
          {JSON.stringify(emails, null, 2)}
        </pre>
      </details>
    </div>
  );
};



