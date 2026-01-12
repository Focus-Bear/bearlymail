import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { EMOJI_CHECK } from 'constants/emojis';

/**
 * Success state component
 * Shown after successful waitlist submission
 */
export const WaitlistSuccess: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: theme.colors.background.default,
        padding: theme.spacing.xl,
      }}
    >
      <div
        style={{
          backgroundColor: theme.colors.background.paper,
          padding: theme.spacing['2xl'],
          borderRadius: theme.borderRadius.lg,
          boxShadow: theme.shadows.lg,
          maxWidth: '600px',
          textAlign: 'center',
        }}
      >
        {/* eslint-disable-next-line i18next/no-literal-string */}
        <div style={{ fontSize: '4rem', marginBottom: theme.spacing.md }}>{EMOJI_CHECK}</div>
        <h1
          style={{
            color: theme.colors.text.primary,
            marginBottom: theme.spacing.md,
            fontSize: theme.typography.fontSize['3xl'],
          }}
        >
          {t('landing.waitlist.success.heading')}
        </h1>
        <p
          style={{
            color: theme.colors.text.secondary,
            marginBottom: theme.spacing.xl,
            lineHeight: 1.6,
          }}
        >
          {t('landing.waitlist.success.description')}
        </p>
        <button
          onClick={() => navigate('/login')}
          style={{
            padding: `${theme.spacing.md} ${theme.spacing.xl}`,
            backgroundColor: theme.colors.primary.main,
            color: 'white',
            border: 'none',
            borderRadius: theme.borderRadius.md,
            fontSize: theme.typography.fontSize.base,
            fontWeight: theme.typography.fontWeight.semibold,
            cursor: 'pointer',
          }}
        >
          {t('landing.waitlist.success.goToLogin')}
        </button>
      </div>
    </div>
  );
};







