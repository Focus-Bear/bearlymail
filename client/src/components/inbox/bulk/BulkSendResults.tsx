import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

interface BulkSendResultsProps {
  sendResults: Map<string, { success: boolean; error?: string }>;
}

export const BulkSendResults: React.FC<BulkSendResultsProps> = ({ sendResults }) => {
  const { t } = useTranslation();

  if (sendResults.size === 0) {
    return null;
  }

  return (
    <div
      style={{
        marginTop: theme.spacing.md,
        padding: theme.spacing.md,
        backgroundColor: theme.colors.background.default,
        borderRadius: theme.borderRadius.md,
      }}
    >
      <div
        style={{
          fontSize: theme.typography.fontSize.sm,
          fontWeight: theme.typography.fontWeight.semibold,
          marginBottom: theme.spacing.xs,
        }}
      >
        {t('inbox.sendResults')}
      </div>
      {Array.from(sendResults.entries()).map(([id, result]) => (
        <div
          key={id}
          style={{
            padding: theme.spacing.xs,
            color: result.success ? theme.colors.success.main : theme.colors.error.main,
            fontSize: theme.typography.fontSize.xs,
          }}
        >
          {result.success ? '✓ ' : '✗ '}
          {result.error || t('inbox.sent')}
        </div>
      ))}
    </div>
  );
};
