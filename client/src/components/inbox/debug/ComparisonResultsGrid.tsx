import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

interface ComparisonResultsGridProps {
  inGmailNotInDb: string[];
  // Note: inDbNotInGmail is no longer available in the new API response shape.
  // The column is kept for UI consistency but will always be empty.
  inDbNotInGmail: string[];
  actionTabResults: number;
}

export const ComparisonResultsGrid: React.FC<ComparisonResultsGridProps> = ({
  inGmailNotInDb = [],
  inDbNotInGmail = [],
  actionTabResults,
}) => {
  const { t } = useTranslation();

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: theme.spacing.sm,
        marginBottom: theme.spacing.md,
        padding: theme.spacing.sm,
        backgroundColor: theme.colors.sunray.light3,
        borderRadius: theme.borderRadius.sm,
      }}
    >
      <div
        style={{
          color: inGmailNotInDb.length > 0 ? 'red' : 'green',
        }}
      >
        <strong>{t('debug.comparison.inGmailNotInDb')}:</strong> {inGmailNotInDb.length}
        {inGmailNotInDb.length > 0 && <div style={{ fontSize: '0.6rem' }}>{inGmailNotInDb.join(', ')}</div>}
      </div>
      <div
        style={{
          color: inDbNotInGmail.length > 0 ? 'orange' : 'green',
        }}
      >
        <strong>{t('debug.comparison.inDbNotInGmail')}:</strong> {inDbNotInGmail.length}
        {inDbNotInGmail.length > 0 && <div style={{ fontSize: '0.6rem' }}>{inDbNotInGmail.join(', ')}</div>}
      </div>
      <div>
        <strong>{t('debug.comparison.actionTabResults')}:</strong> {actionTabResults}
      </div>
    </div>
  );
};
