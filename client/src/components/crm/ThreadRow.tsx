import React from 'react';
import { theme } from 'theme/theme';

import { STRING_FLEX, STRING_POINTER, THREAD_ROLE_FROM } from 'constants/strings';
import { ContactThread } from 'hooks/useContactThreads';

export interface ThreadRowProps {
  thread: ContactThread;
  onNavigate: (emailThreadId: string) => void;
}

export const ThreadRow: React.FC<ThreadRowProps> = ({ thread, onNavigate }) => {
  const displayDate = new Date(thread.receivedAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div
      onClick={() => onNavigate(thread.emailThreadId)}
      style={{
        display: STRING_FLEX,
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: theme.spacing.md,
        backgroundColor: thread.isRead ? theme.colors.background.default : theme.colors.background.paper,
        borderRadius: theme.borderRadius.md,
        border: `1px solid ${theme.colors.border.light}`,
        cursor: STRING_POINTER,
        gap: theme.spacing.md,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            color: theme.colors.text.primary,
            fontWeight: thread.isRead ? theme.typography.fontWeight.normal : theme.typography.fontWeight.semibold,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            marginBottom: theme.spacing.xs,
          }}
        >
          {thread.subject ?? '(no subject)'}
        </div>
        <div
          style={{
            color: theme.colors.text.secondary,
            fontSize: theme.typography.fontSize.sm,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {thread.fromName ?? thread.from ?? ''}
        </div>
      </div>

      <div style={{ flexShrink: 0, textAlign: 'right' }}>
        <div style={{ color: theme.colors.text.tertiary, fontSize: theme.typography.fontSize.xs }}>{displayDate}</div>
        <div
          style={{
            marginTop: theme.spacing.xs,
            fontSize: theme.typography.fontSize.xs,
            color: thread.role === THREAD_ROLE_FROM ? theme.colors.primary.main : theme.colors.text.tertiary,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          {thread.role}
        </div>
      </div>
    </div>
  );
};

export default ThreadRow;
