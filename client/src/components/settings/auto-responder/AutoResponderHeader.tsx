import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { theme } from 'theme/theme';

import { HELP_ARTICLE_IDS, helpArticlePath } from 'constants/helpArticles';

export const AutoResponderHeader: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div style={{ marginBottom: theme.spacing.lg }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm }}>
        <span style={{ fontSize: '1.5rem' }}>🤖</span>
        <h2
          style={{
            ...theme.typography.heading.h4,
            color: theme.colors.text.primary,
            margin: 0,
          }}
        >
          {t('settings.autoResponder.title')}
        </h2>
      </div>
      <p
        style={{
          ...theme.typography.body.large,
          color: theme.colors.text.secondary,
          marginTop: theme.spacing.sm,
          marginBottom: 0,
        }}
      >
        {t('settings.autoResponder.description')}{' '}
        <Link
          to={helpArticlePath(HELP_ARTICLE_IDS.AUTORESPONDER)}
          style={{
            color: theme.colors.primary.main,
            textDecoration: 'underline',
          }}
        >
          {t('settings.autoResponder.learnMore')}
        </Link>
      </p>
    </div>
  );
};
