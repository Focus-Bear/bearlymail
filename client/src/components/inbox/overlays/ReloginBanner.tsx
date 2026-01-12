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
        padding: theme.spacing.md,
        textAlign: 'center',
        fontWeight: theme.typography.fontWeight.medium,
      }}
    >
      {t('auth.reloginRequired')}
    </div>
  );
};





