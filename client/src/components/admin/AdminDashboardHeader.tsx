import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { STRING_NONE } from 'constants/strings';

interface AdminDashboardHeaderProps {
  onLogout: () => void;
}

export const AdminDashboardHeader: React.FC<AdminDashboardHeaderProps> = ({ onLogout }) => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <header style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: theme.spacing['2xl'],
    }}>
      <div>
        <h1 style={{
          fontSize: theme.typography.fontSize['3xl'],
          fontWeight: theme.typography.fontWeight.bold,
          color: theme.colors.text.primary,
          marginBottom: theme.spacing.xs,
        }}>
          {t('admin.dashboard.title')}
        </h1>
        <p style={{ color: theme.colors.text.secondary }}>
          {t('admin.dashboard.description')}
        </p>
      </div>
      <div style={{ display: 'flex', gap: theme.spacing.md }}>
        <button
          onClick={() => navigate('/inbox')}
          style={{
            padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
            backgroundColor: theme.colors.common.transparent,
            color: theme.colors.text.secondary,
            border: `1px solid ${theme.colors.border.medium}`,
            borderRadius: theme.borderRadius.md,
            cursor: 'pointer',
          }}
        >
          {t('admin.dashboard.backToInbox')}
        </button>
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

