import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { BackToInboxLink } from 'components/common/BackToInboxLink';
import { STRING_NONE } from 'constants/strings';

interface AdminDashboardHeaderProps {
  onLogout: () => void;
}

export const AdminDashboardHeader: React.FC<AdminDashboardHeaderProps> = ({ onLogout }) => {
  const { t } = useTranslation();

  return (
    <header
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: theme.spacing['2xl'],
      }}
    >
      <div>
        <h1
          style={{
            fontSize: theme.typography.fontSize['3xl'],
            fontWeight: theme.typography.fontWeight.bold,
            color: theme.colors.text.primary,
            marginBottom: theme.spacing.xs,
          }}
        >
          {t('admin.dashboard.title')}
        </h1>
        <p style={{ color: theme.colors.text.secondary }}>{t('admin.dashboard.description')}</p>
      </div>
      <div style={{ display: 'flex', gap: theme.spacing.md }}>
        <BackToInboxLink />
        <button
          onClick={onLogout}
          style={{
            padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
            backgroundColor: theme.colors.accent.error,
            color: theme.colors.common.white,
            border: STRING_NONE,
            borderRadius: theme.borderRadius.md,
            cursor: 'pointer',
          }}
        >
          {t('auth.logout')}
        </button>
      </div>
    </header>
  );
};
