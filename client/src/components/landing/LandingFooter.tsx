import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { getResponsiveFontSize, getResponsiveSpacing } from 'components/landing/utils';
import { useResponsiveBreakpoints } from 'hooks/useResponsiveBreakpoints';

/**
 * Landing page footer component
 * Displays links to legal pages (Privacy Policy, Terms of Use)
 */
export const LandingFooter: React.FC = () => {
  const { t } = useTranslation();
  const breakpoints = useResponsiveBreakpoints();

  const horizontalPadding = getResponsiveSpacing(breakpoints, {
    mobile: theme.spacing.md,
    tablet: theme.spacing.lg,
    desktop: theme.spacing['2xl'],
  });

  const fontSize = getResponsiveFontSize(breakpoints, {
    mobile: theme.typography.fontSize.sm,
    tablet: theme.typography.fontSize.base,
    desktop: theme.typography.fontSize.base,
  });

  const linkStyle: React.CSSProperties = {
    color: theme.colors.primary.main,
    textDecoration: 'none',
    cursor: 'pointer',
    fontSize,
  };

  return (
    <footer
      style={{
        padding: `${theme.spacing.lg} ${horizontalPadding}`,
        backgroundColor: theme.colors.background.paper,
        borderTop: `1px solid ${theme.colors.border.light}`,
        marginTop: theme.spacing['3xl'],
      }}
    >
      <div
        style={{
          maxWidth: '1200px',
          margin: '0 auto',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: theme.spacing.lg,
          flexWrap: 'wrap',
        }}
      >
        <a
          href="https://app.bearlymail.com/privacy"
          style={linkStyle}
          onMouseEnter={event => {
            event.currentTarget.style.textDecoration = 'underline';
          }}
          onMouseLeave={event => {
            event.currentTarget.style.textDecoration = 'none';
          }}
        >
          {t('consent.privacyPolicy')}
        </a>
        <span style={{ color: theme.colors.text.secondary, fontSize }}>•</span>
        <a
          href="https://app.bearlymail.com/terms"
          style={linkStyle}
          onMouseEnter={event => {
            event.currentTarget.style.textDecoration = 'underline';
          }}
          onMouseLeave={event => {
            event.currentTarget.style.textDecoration = 'none';
          }}
        >
          {t('consent.termsOfUse')}
        </a>
      </div>
    </footer>
  );
};
