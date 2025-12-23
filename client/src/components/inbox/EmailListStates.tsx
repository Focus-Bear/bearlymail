import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from '../../theme/theme';
import { InboxMode } from '../../types/email';

interface EmailListStatesProps {
  loading: boolean;
  hasInitiallyLoaded: boolean;
  loadingModeSwitch: boolean;
  decrypting: boolean;
  fetchError: string | null;
  emailsEmpty: boolean;
  mode: InboxMode;
  onRetry: () => void;
}

export const EmailListStates: React.FC<EmailListStatesProps> = ({
  loading,
  hasInitiallyLoaded,
  loadingModeSwitch,
  decrypting,
  fetchError,
  emailsEmpty,
  mode,
  onRetry,
}) => {
  const { t } = useTranslation();

  // Loading state
  if (loading || !hasInitiallyLoaded || loadingModeSwitch) {
    return (
      <div style={{
        padding: theme.spacing['3xl'],
        textAlign: 'center',
        backgroundColor: theme.colors.background.paper,
        borderRadius: theme.borderRadius.xl,
        border: `1px dashed ${theme.colors.border.medium}`,
      }}>
        <div style={{
          width: '40px',
          height: '40px',
          border: `3px solid ${theme.colors.border.light}`,
          borderTop: `3px solid ${theme.colors.primary.main}`,
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          margin: '0 auto',
          marginBottom: theme.spacing.md,
        }} />
        <h3 style={{
          color: theme.colors.text.primary,
          marginBottom: theme.spacing.sm,
          fontWeight: theme.typography.fontWeight.semibold
        }}>
          {decrypting
            ? 'Decrypting emails...'
            : loadingModeSwitch
              ? `Loading ${mode === 'action' ? 'starred' : mode === 'follow-up' ? 'follow-up' : 'unstarred'} emails...`
              : t('inbox.loadingEmails')}
        </h3>
        {!loadingModeSwitch && (
          <p style={{ color: theme.colors.text.secondary }}>
            {t('inbox.loadingEmailsSub')}
          </p>
        )}
      </div>
    );
  }

  // Error state
  if (fetchError) {
    return (
      <div style={{
        padding: theme.spacing['3xl'],
        textAlign: 'center',
        backgroundColor: theme.colors.background.paper,
        borderRadius: theme.borderRadius.xl,
        border: `2px solid ${theme.colors.accent.error}`,
      }}>
        <div style={{ fontSize: '3rem', marginBottom: theme.spacing.md }}>�</div>
        <h3 style={{
          color: theme.colors.accent.error,
          marginBottom: theme.spacing.sm,
          fontWeight: theme.typography.fontWeight.semibold
        }}>
          Error Loading Emails
        </h3>
        <p style={{
          color: theme.colors.text.secondary,
          marginBottom: theme.spacing.lg,
        }}>
          {fetchError}
        </p>
        <button
          onClick={onRetry}
          style={{
            padding: `${theme.spacing.md} ${theme.spacing.xl}`,
            backgroundColor: theme.colors.primary.main,
            color: 'white',
            border: 'none',
            borderRadius: theme.borderRadius.md,
            cursor: 'pointer',
            fontSize: theme.typography.fontSize.base,
            fontWeight: theme.typography.fontWeight.medium,
          }}
        >
          Try Again
        </button>
      </div>
    );
  }

  // Empty state
  if (emailsEmpty) {
    return (
      <div style={{
        padding: theme.spacing['3xl'],
        textAlign: 'center',
        backgroundColor: theme.colors.background.paper,
        borderRadius: theme.borderRadius.xl,
        border: `1px dashed ${theme.colors.border.medium}`,
      }}>
        <div style={{ fontSize: '3rem', marginBottom: theme.spacing.md }}>=�</div>
        <h3 style={{
          color: theme.colors.text.primary,
          marginBottom: theme.spacing.sm,
          fontWeight: theme.typography.fontWeight.semibold
        }}>
          {mode === 'triage' ? t('inbox.noTriageEmails') : mode === 'action' ? t('inbox.noActionEmails') : t('inbox.noFollowUpEmails')}
        </h3>
        <p style={{ color: theme.colors.text.secondary }}>
          {mode === 'triage' ? t('inbox.triageCaughtUp') : mode === 'action' ? t('inbox.actionCaughtUp') : t('inbox.followUpCaughtUp')}
        </p>
      </div>
    );
  }

  // If none of the above, return null (emails will be rendered by parent)
  return null;
};
