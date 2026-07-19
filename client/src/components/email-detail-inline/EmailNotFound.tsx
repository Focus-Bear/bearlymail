import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

export const EmailNotFound: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div style={{ padding: theme.spacing.xl, textAlign: 'center' }}>
      <p style={{ color: theme.colors.text.secondary }}>{t('emailDetail.emailNotFound')}</p>
    </div>
  );
};
