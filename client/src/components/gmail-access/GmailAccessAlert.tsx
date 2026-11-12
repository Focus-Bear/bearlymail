import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { API_URL } from 'config/api';
import { COLOR_NAMED_WHITE } from 'constants/colors';
import { GOOGLE_OAUTH_START_PATH, STRING_NONE } from 'constants/strings';

/**
 * `BANNER` spans the top of the inbox (every mode); `PANEL` is a card for the
 * empty inbox and Settings.
 */
export const GMAIL_ACCESS_ALERT_LAYOUT = {
  BANNER: 'banner',
  PANEL: 'panel',
} as const;
export type GmailAccessAlertLayout = (typeof GMAIL_ACCESS_ALERT_LAYOUT)[keyof typeof GMAIL_ACCESS_ALERT_LAYOUT];

interface GmailAccessAlertProps {
  layout: GmailAccessAlertLayout;
}

/**
 * Restarts Google sign-in. The server always forces Google's consent screen,
 * so the user gets the Gmail checkboxes again; the callback refreshes the
 * tokens on this same account.
 */
export function startGoogleReconnect(): void {
  window.location.href = `${API_URL}${GOOGLE_OAUTH_START_PATH}`;
}

/**
 * Explains why the inbox is empty when the server can't read the user's Gmail
 * (scopes declined on Google's consent screen, or access revoked), with the
 * one action that fixes it. Deliberately not dismissible: nothing works until
 * the user reconnects.
 */
export const GmailAccessAlert: React.FC<GmailAccessAlertProps> = ({ layout }) => {
  const { t } = useTranslation();
  const isBanner = layout === GMAIL_ACCESS_ALERT_LAYOUT.BANNER;

  return (
    <div
      role="alert"
      data-testid={`gmail-access-alert-${layout}`}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: theme.spacing.md,
        padding: isBanner ? `${theme.spacing.md} ${theme.spacing.lg}` : theme.spacing.lg,
        margin: isBanner ? 0 : `${theme.spacing.md} 0`,
        backgroundColor: theme.colors.error.light,
        borderLeft: `4px solid ${theme.colors.error.dark}`,
        borderRadius: isBanner ? 0 : theme.borderRadius.md,
        color: theme.colors.text.primary,
      }}
    >
      <div style={{ flex: '1 1 280px', minWidth: 0 }}>
        <div
          style={{
            fontWeight: theme.typography.fontWeight.bold,
            fontSize: theme.typography.fontSize.base,
            color: theme.colors.error.dark,
            marginBottom: theme.spacing.xs,
          }}
        >
          {t('gmail.accessIssueTitle')}
        </div>
        <div style={{ fontSize: theme.typography.fontSize.sm, lineHeight: 1.5 }}>{t('gmail.accessIssueMessage')}</div>
      </div>
      <button
        type="button"
        onClick={startGoogleReconnect}
        style={{
          flexShrink: 0,
          backgroundColor: theme.colors.error.dark,
          color: COLOR_NAMED_WHITE,
          border: STRING_NONE,
          borderRadius: theme.borderRadius.md,
          padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
          fontWeight: theme.typography.fontWeight.semibold,
          fontSize: theme.typography.fontSize.sm,
          cursor: 'pointer',
        }}
      >
        {t('gmail.reconnectGoogle')}
      </button>
    </div>
  );
};
