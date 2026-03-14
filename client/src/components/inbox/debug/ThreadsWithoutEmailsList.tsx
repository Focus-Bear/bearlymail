import React from 'react';
import { useTranslation } from 'react-i18next';
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

export const ThreadsWithoutEmailsList: React.FC<ThreadsWithoutEmailsListProps> = ({ threads = [] }) => {
  const { t } = useTranslation();

  if (!threads?.length) {
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
        {t('debug.threadsWithoutEmails.title', { count: threads.length })}
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
            <strong>{t('debug.threadsWithoutEmails.dbId')}:</strong> {thread.id} |{' '}
            <strong>{t('debug.threadsWithoutEmails.gmailThread')}:</strong> {thread.threadId} |{' '}
            <strong>{t('debug.threadsWithoutEmails.stars')}:</strong> {thread.starCount} |{' '}
            <strong>{t('debug.threadsWithoutEmails.archived')}:</strong>{' '}
            {thread.isArchived ? t('debug.threadsWithoutEmails.yes') : t('debug.threadsWithoutEmails.no')}
          </span>
        </div>
      ))}
    </details>
  );
};
