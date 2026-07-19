import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { COLOR_NAMED_WHITE } from 'constants/colors';
import { STRING_NONE } from 'constants/strings';

interface ReloginBannerProps {
  onLogout: () => void;
}

/**
 * Re-login banner component
 */
export const ReloginBanner: React.FC<ReloginBannerProps> = ({ onLogout }) => {
  const { t } = useTranslation();

  return (
    <div
      style={{
        backgroundColor: theme.colors.accent.error,
        color: COLOR_NAMED_WHITE,
        padding: `${theme.spacing.sm} ${theme.spacing.md}`,
        textAlign: 'center',
        fontWeight: theme.typography.fontWeight.medium,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.spacing.sm,
        fontSize: theme.typography.fontSize.sm,
      }}
    >
      <span>{t('auth.reloginRequired')}</span>
      <button
        onClick={onLogout}
        style={{
          backgroundColor: COLOR_NAMED_WHITE,
          color: theme.colors.accent.error,
          border: STRING_NONE,
          borderRadius: theme.borderRadius.sm,
          padding: `${theme.spacing.xs} ${theme.spacing.md}`,
          fontWeight: theme.typography.fontWeight.semibold,
          fontSize: theme.typography.fontSize.sm,
          cursor: 'pointer',
        }}
      >
        {t('auth.logout')}
      </button>
    </div>
  );
};
