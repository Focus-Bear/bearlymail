import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

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
        color: 'white',
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
          backgroundColor: 'white',
          color: theme.colors.accent.error,
          border: 'none',
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





