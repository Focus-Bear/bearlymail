import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { InboxMode } from 'types/email';

import { MODE_ACTION, MODE_AUTORESPONDED, MODE_FOLLOW_UP } from 'constants/strings';

interface LoadingStateProps {
  decrypting: boolean;
  loadingModeSwitch: boolean;
  mode: InboxMode;
}

/**
 * Loading state component
 * Displays loading indicator for email list
 */
export const LoadingState: React.FC<LoadingStateProps> = ({ decrypting, loadingModeSwitch, mode }) => {
  const { t } = useTranslation();

  const getLoadingTitle = (): string => {
    if (decrypting) {
      return t('inbox.decryptingEmails');
    }
    if (loadingModeSwitch) {
      if (mode === MODE_ACTION) {
        return t('inbox.loadingActionEmails');
      }
      if (mode === MODE_FOLLOW_UP) {
        return t('inbox.loadingFollowUpEmails');
      }
      if (mode === MODE_AUTORESPONDED) {
        return t('inbox.loadingAutoRespondedEmails');
      }
      return t('inbox.loadingTriageEmails');
    }
    return t('inbox.loadingEmails');
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
        {getLoadingTitle()}
      </h3>
      {!loadingModeSwitch && <p style={{ color: theme.colors.text.secondary }}>{t('inbox.loadingEmailsSub')}</p>}
    </div>
  );
};
