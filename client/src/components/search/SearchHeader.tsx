import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { theme } from 'theme/theme';
import { captureEvent } from 'utils/posthog';

import { BackToInboxLink } from 'components/common/BackToInboxLink';
import { ANALYTICS_EVENTS } from 'constants/analytics-events';

export const SearchHeader: React.FC = () => {
  const { t } = useTranslation();

  return (
    <header
      style={{
        padding: theme.spacing.lg,
        borderBottom: `1px solid ${theme.colors.border.light}`,
        backgroundColor: theme.colors.background.paper,
      }}
    >
      <div
        style={{
          maxWidth: '1200px',
          margin: '0 auto',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.md }}>
          <h1
            style={{
              fontSize: theme.typography.fontSize['2xl'],
              fontWeight: theme.typography.fontWeight.bold,
              color: theme.colors.text.primary,
              margin: 0,
            }}
          >
            {t('search.title')}
          </h1>
          <Link
            to="/help/search"
            onClick={() => captureEvent(ANALYTICS_EVENTS.SEARCH_HELP_CLICKED)}
            style={{
              fontSize: theme.typography.fontSize.sm,
              color: theme.colors.text.tertiary,
              textDecoration: 'none',
            }}
            onMouseEnter={event => {
              event.currentTarget.style.color = theme.colors.primary.main;
              event.currentTarget.style.textDecoration = 'underline';
            }}
            onMouseLeave={event => {
              event.currentTarget.style.color = theme.colors.text.tertiary;
              event.currentTarget.style.textDecoration = 'none';
            }}
          >
            {t('search.help')}
          </Link>
        </div>
        <BackToInboxLink onClick={() => captureEvent(ANALYTICS_EVENTS.SEARCH_BACK_TO_INBOX_CLICKED)} />
      </div>
    </header>
  );
};
