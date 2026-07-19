import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

/**
 * Syncing state component.
 * Shown when the inbox is empty because a mailbox sync is still in progress
 * (e.g. the first sync after connecting an account). Friendlier than the
 * generic "all caught up" empty state, which would misleadingly imply there
 * is nothing to see.
 */
export const SyncingState: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div
      style={{
        padding: theme.spacing['3xl'],
        textAlign: 'center',
        backgroundColor: theme.colors.background.paper,
        borderRadius: theme.borderRadius.xl,
        border: `1px dashed ${theme.colors.border.medium}`,
      }}
    >
      <div
        style={{
          width: '40px',
          height: '40px',
          border: `3px solid ${theme.colors.border.light}`,
          borderTop: `3px solid ${theme.colors.primary.main}`,
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          margin: '0 auto',
          marginBottom: theme.spacing.md,
        }}
      />
      <h3
        style={{
          color: theme.colors.text.primary,
          marginBottom: theme.spacing.sm,
          fontWeight: theme.typography.fontWeight.semibold,
        }}
      >
        {t('inbox.syncingMailbox')}
      </h3>
      <p style={{ color: theme.colors.text.secondary }}>{t('inbox.syncingMailboxSub')}</p>
    </div>
  );
};
