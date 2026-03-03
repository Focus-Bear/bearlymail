import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { captureEvent } from 'utils/posthog';
import { COLOR_TRANSPARENT } from 'constants/colors';


export const SearchHeader: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <header style={{
      padding: theme.spacing.lg,
      borderBottom: `1px solid ${theme.colors.border.light}`,
      backgroundColor: theme.colors.background.paper,
    }}>
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.md }}>
          <h1 style={{
            fontSize: theme.typography.fontSize['2xl'],
            fontWeight: theme.typography.fontWeight.bold,
            color: theme.colors.text.primary,
            margin: 0,
          }}>
            {t('search.title')}
          </h1>
          <Link
            to="/help/search"
            onClick={() => captureEvent('search_help_clicked')}
            style={{
              fontSize: theme.typography.fontSize.xs,
              color: theme.colors.text.tertiary,
              textDecoration: 'none',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = theme.colors.primary.main;
              e.currentTarget.style.textDecoration = 'underline';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = theme.colors.text.tertiary;
              e.currentTarget.style.textDecoration = 'none';
            }}
          >
            {t('search.help')}
          </Link>
        </div>
        <button
          onClick={() => {
            captureEvent('search_back_to_inbox_clicked');
            navigate('/inbox');
          }}
          style={{
            padding: `${theme.spacing.sm} ${theme.spacing.md}`,
            backgroundColor: COLOR_TRANSPARENT,
            color: theme.colors.text.secondary,
            border: `1px solid ${theme.colors.border.medium}`,
            borderRadius: theme.borderRadius.md,
            cursor: 'pointer',
          }}
        >
          {t('search.backToInbox')}
        </button>
      </div>
    </header>
  );
};





