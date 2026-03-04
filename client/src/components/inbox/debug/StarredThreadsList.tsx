import React from 'react';
import { theme } from 'theme/theme';

import { COLOR_NAMED_RED } from 'constants/colors';

interface StarredThread {
  threadId: string;
  starCount: number;
  isArchived: boolean;
  isSnoozed: boolean;
  emailCount: number;
  latestSubject: string;
  latestFrom: string;
  issues: string[];
  inGmail: boolean;
  lastCheckedAt?: string | null;
}

interface StarredThreadsListProps {
  threads: StarredThread[];
}

const getThreadKey = (thread: StarredThread, index: number): string => {
  return `thread-${thread.threadId}-${index}`;
};

const getBackgroundColor = (hasIssues: boolean): string => {
  if (hasIssues) return '#FFE6E6';
  return '#D4EDDA';
};

const getBorderColor = (hasIssues: boolean): string => {
  if (hasIssues) return '#F5C6CB';
  return '#C3E6CB';
};

export const StarredThreadsList: React.FC<StarredThreadsListProps> = ({
  threads,
}) => {
  return (
    <details>
      <summary
        style={{
          cursor: 'pointer',
          fontWeight: 'bold',
          marginBottom: theme.spacing.sm,
        }}
      >
        All Starred Threads in DB ({threads.length})
      </summary>
      {threads.map((thread, index) => (
        <div
          key={getThreadKey(thread, index)}
          style={{
            padding: theme.spacing.sm,
            backgroundColor: getBackgroundColor(thread.issues.length > 0),
            border: `1px solid ${getBorderColor(thread.issues.length > 0)}`,
            borderRadius: theme.borderRadius.sm,
            marginBottom: theme.spacing.xs,
          }}
        >
          <div style={{ display: 'flex', gap: theme.spacing.md, flexWrap: 'wrap' }}>
            <span>
              <strong>Thread:</strong> {thread.threadId}
            </span>
            <span>
              <strong>Stars:</strong> {'⭐'.repeat(thread.starCount)}
            </span>
            <span>
              <strong>Emails:</strong> {thread.emailCount}
            </span>
            <span>
              <strong>Archived:</strong> {thread.isArchived ? '❌ YES' : '✅ NO'}
            </span>
            <span>
              <strong>In Gmail:</strong> {thread.inGmail ? '✅' : '❌'}
            </span>
            {thread.lastCheckedAt && (
              <span>
                <strong>Last checked:</strong> {new Date(thread.lastCheckedAt).toLocaleString()}
              </span>
            )}
          </div>
          <div
            style={{
              fontSize: '0.65rem',
              color: theme.colors.text.secondary,
              marginTop: '2px',
            }}
          >
            {thread.latestFrom}: {thread.latestSubject}
          </div>
          {thread.issues.length > 0 && (
            <div style={{ color: COLOR_NAMED_RED, marginTop: '4px' }}>
              <strong>Issues:</strong> {thread.issues.join(', ')}
            </div>
          )}
        </div>
      ))}
    </details>
  );
};






