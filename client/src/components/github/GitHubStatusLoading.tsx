import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

export const GitHubStatusLoading: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div style={{ textAlign: 'center', padding: theme.spacing.lg, color: theme.colors.text.secondary }}>
      <span
        style={{
          display: 'inline-block',
          width: '16px',
          height: '16px',
          border: `2px solid ${theme.colors.primary.main}`,
          borderTop: '2px solid transparent',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          marginRight: theme.spacing.sm,
        }}
      />
      {t('github.loadingStatus')}
    </div>
  );
};
