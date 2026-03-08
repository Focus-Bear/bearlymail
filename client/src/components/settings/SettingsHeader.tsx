import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { theme } from 'theme/theme';

export const SettingsHeader: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div
      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.xl }}
    >
      <h1
        style={{
          color: theme.colors.text.primary,
          margin: 0,
          fontSize: theme.typography.fontSize['3xl'],
        }}
      >
        {t('settings.title')}
      </h1>
      <Link
        to="/help/settings"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '32px',
          height: '32px',
          borderRadius: '50%',
          backgroundColor: theme.colors.background.subtle,
          color: theme.colors.text.secondary,
          textDecoration: 'none',
          fontSize: theme.typography.fontSize.lg,
          fontWeight: theme.typography.fontWeight.bold,
          transition: theme.transitions.default,
        }}
        onMouseEnter={event => {
          event.currentTarget.style.backgroundColor = theme.colors.primary.subtle;
          event.currentTarget.style.color = theme.colors.primary.main;
        }}
        onMouseLeave={event => {
          event.currentTarget.style.backgroundColor = theme.colors.background.subtle;
          event.currentTarget.style.color = theme.colors.text.secondary;
        }}
        title={t('help.title')}
      >
        ?
      </Link>
    </div>
  );
};
