import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { theme } from 'theme/theme';

const NotFound: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        fontFamily: theme.typography.fontFamily,
        backgroundColor: theme.colors.background.default,
        color: theme.colors.text?.primary ?? '#333',
        gap: '1rem',
      }}
    >
      <h1 style={{ fontSize: '4rem', margin: 0 }}>404</h1>
      <p style={{ fontSize: '1.25rem', margin: 0 }}>{t('common.pageNotFound')}</p>
      <Link to="/" style={{ color: theme.colors.primary?.main ?? '#1976d2', textDecoration: 'none' }}>
        {t('common.goHome')}
      </Link>
    </div>
  );
};

export default NotFound;
