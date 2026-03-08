import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

interface OrphanStatsGridProps {
  totalEmailsInDb: number;
  emailsWithThreadId: number;
  orphanEmails: number;
  threadsInDb: number;
}

export const OrphanStatsGrid: React.FC<OrphanStatsGridProps> = ({
  totalEmailsInDb,
  emailsWithThreadId,
  orphanEmails,
  threadsInDb,
}) => {
  const { t } = useTranslation();

  const getStatsBackgroundColor = (): string => {
    return orphanEmails > 0 ? '#FFE6E6' : '#E8F4FD';
  };

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: theme.spacing.sm,
        marginBottom: theme.spacing.md,
        padding: theme.spacing.sm,
        backgroundColor: getStatsBackgroundColor(),
        borderRadius: theme.borderRadius.sm,
      }}
    >
      <div>
        <strong>{t('debug.orphan.totalEmails')}:</strong> {totalEmailsInDb}
      </div>
      <div>
        <strong>{t('debug.orphan.withThreadId')}:</strong> {emailsWithThreadId}
      </div>
      <div
        style={{
          color: orphanEmails > 0 ? 'red' : 'green',
          fontWeight: 'bold',
        }}
      >
        <strong>{t('debug.orphan.orphanEmails')}:</strong> {orphanEmails}
      </div>
      <div>
        <strong>{t('debug.orphan.threadsInDb')}:</strong> {threadsInDb}
      </div>
    </div>
  );
};
