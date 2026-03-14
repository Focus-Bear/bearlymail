import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { COLOR_NAMED_RED } from 'constants/colors';

interface StarredThread {
  threadId: string;
  subject: string | null;
  inDb: boolean;
  isStarredInDb: boolean;
  category: string | null;
  appearsInActionOrFollowUp: boolean;
  reason: string;
}

interface StarredThreadsListProps {
  threads: StarredThread[];
}

const getThreadKey = (thread: StarredThread, index: number): string => {
  return `thread-${thread.threadId}-${index}`;
};

const getBackgroundColor = (thread: StarredThread): string => {
  if (!thread.inDb) {
    return '#FFE6E6';
  }
  if (!thread.isStarredInDb) {
    return '#FFF3CD';
  }
  if (thread.appearsInActionOrFollowUp) {
    return '#D4EDDA';
  }
  return '#E6F0FF';
};

const getBorderColor = (thread: StarredThread): string => {
  if (!thread.inDb) {
    return '#F5C6CB';
  }
  if (!thread.isStarredInDb) {
    return '#FFEEBA';
  }
  if (thread.appearsInActionOrFollowUp) {
    return '#C3E6CB';
  }
  return '#B8D4FF';
};

export const StarredThreadsList: React.FC<StarredThreadsListProps> = ({ threads = [] }) => {
  const { t } = useTranslation();

  return (
    <details>
      <summary
        style={{
          cursor: 'pointer',
          fontWeight: 'bold',
          marginBottom: theme.spacing.sm,
        }}
      >
        {t('debug.starredThreadsList.title', { count: threads?.length ?? 0 })}
      </summary>
      {(threads ?? []).map((thread, index) => (
        <div
          key={getThreadKey(thread, index)}
          style={{
            padding: theme.spacing.sm,
            backgroundColor: getBackgroundColor(thread),
            border: `1px solid ${getBorderColor(thread)}`,
            borderRadius: theme.borderRadius.sm,
            marginBottom: theme.spacing.xs,
          }}
        >
          <div style={{ display: 'flex', gap: theme.spacing.md, flexWrap: 'wrap' }}>
            <span>
              <strong>{t('debug.starredThreadsList.thread')}:</strong> {thread.threadId}
            </span>
            <span>
              <strong>{t('debug.starredThreadsList.inDb')}:</strong>{' '}
              {thread.inDb ? '✅' : t('debug.starredThreadsList.notSynced')}
            </span>
            <span>
              <strong>{t('debug.starredThreadsList.starredInDb')}:</strong> {thread.isStarredInDb ? '⭐' : '—'}
            </span>
            <span>
              <strong>{t('debug.starredThreadsList.actionFollowUp')}:</strong> {thread.appearsInActionOrFollowUp ? '✅' : '—'}
            </span>
            {thread.category && (
              <span>
                <strong>{t('debug.starredThreadsList.category')}:</strong> {thread.category}
              </span>
            )}
          </div>
          {thread.subject && (
            <div
              style={{
                fontSize: '0.65rem',
                color: theme.colors.text.secondary,
                marginTop: '2px',
              }}
            >
              {thread.subject}
            </div>
          )}
          <div style={{ color: COLOR_NAMED_RED, marginTop: '4px', fontSize: '0.75rem' }}>
            {thread.reason}
          </div>
        </div>
      ))}
    </details>
  );
};
