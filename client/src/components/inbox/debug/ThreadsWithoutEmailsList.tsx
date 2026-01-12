import React from 'react';
import { theme } from 'theme/theme';

interface ThreadWithoutEmails {
  id: string;
  threadId: string;
  starCount: number;
  isArchived: boolean;
}

interface ThreadsWithoutEmailsListProps {
  threads: ThreadWithoutEmails[];
}

const getThreadKey = (thread: ThreadWithoutEmails, index: number): string => {
  return `thread-${thread.id}-${index}`;
};

export const ThreadsWithoutEmailsList: React.FC<ThreadsWithoutEmailsListProps> = ({
  threads,
}) => {
  if (threads.length === 0) {
    return null;
  }

  return (
    <details>
      <summary
        style={{
          cursor: 'pointer',
          fontWeight: 'bold',
          marginBottom: theme.spacing.sm,
          color: 'orange',
        }}
      >
        ⚠️ Threads Without Emails ({threads.length})
      </summary>
      {threads.map((thread, index) => (
        <div
          key={getThreadKey(thread, index)}
          style={{
            padding: theme.spacing.sm,
            backgroundColor: theme.colors.sunray.light3,
            border: '1px solid #FFEEBA',
            borderRadius: theme.borderRadius.sm,
            marginBottom: theme.spacing.xs,
          }}
        >
          <span>
            <strong>DB ID:</strong> {thread.id} | <strong>Gmail Thread:</strong>{' '}
            {thread.threadId} | <strong>Stars:</strong> {thread.starCount} |{' '}
            <strong>Archived:</strong> {thread.isArchived ? 'YES' : 'NO'}
          </span>
        </div>
      ))}
    </details>
  );
};






