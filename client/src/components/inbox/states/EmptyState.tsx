import React from 'react';
import { MODE_TRIAGE, MODE_ACTION } from 'constants/strings';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { InboxMode } from 'types/email';

interface EmptyStateProps {
  mode: InboxMode;
}

/**
 * Empty state component
 * Displays message when no emails are available
 */
export const EmptyState: React.FC<EmptyStateProps> = ({ mode }) => {
  const { t } = useTranslation();

  const getTitle = (): string => {
    if (mode === MODE_TRIAGE) return t('inbox.noTriageEmails');
    if (mode === MODE_ACTION) return t('inbox.noActionEmails');
    return t('inbox.noFollowUpEmails');
  };

  const getMessage = (): string => {
    if (mode === MODE_TRIAGE) return t('inbox.triageCaughtUp');
    if (mode === MODE_ACTION) return t('inbox.actionCaughtUp');
    return t('inbox.followUpCaughtUp');
  };

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
      <div style={{ fontSize: '3rem', marginBottom: theme.spacing.md }}>📭</div>
      <h3
        style={{
          color: theme.colors.text.primary,
          marginBottom: theme.spacing.sm,
          fontWeight: theme.typography.fontWeight.semibold,
        }}
      >
        {getTitle()}
      </h3>
      <p style={{ color: theme.colors.text.secondary }}>{getMessage()}</p>
    </div>
  );
};






