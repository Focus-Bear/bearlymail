import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { API_URL } from 'config/api';
import { COLOR_NAMED_WHITE } from 'constants/colors';
import { STRING_NONE } from 'constants/strings';

export const GmailEmptyState: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div
      style={{
        padding: theme.spacing.xl,
        textAlign: 'center',
        backgroundColor: theme.colors.background.subtle,
        borderRadius: theme.borderRadius.md,
        marginBottom: theme.spacing.md,
      }}
    >
      <p
        style={{
          color: theme.colors.text.secondary,
          marginBottom: theme.spacing.lg,
          fontSize: theme.typography.fontSize.base,
        }}
      >
        {t('settings.gmail.emptyState')}
      </p>
      <button
        onClick={() => {
          window.location.href = `${API_URL}/google-accounts/connect`;
        }}
        style={{
          padding: `${theme.spacing.md} ${theme.spacing.xl}`,
          backgroundColor: theme.colors.primary.main,
          color: COLOR_NAMED_WHITE,
          border: STRING_NONE,
          borderRadius: theme.borderRadius.md,
          fontSize: theme.typography.fontSize.base,
          fontWeight: theme.typography.fontWeight.semibold,
          cursor: 'pointer',
        }}
      >
        {t('settings.gmail.connectAccount')}
      </button>
    </div>
  );
};
