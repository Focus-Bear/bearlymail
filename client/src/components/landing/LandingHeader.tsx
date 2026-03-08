import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { theme } from 'theme/theme';

import { getResponsiveFontSize, getResponsiveSpacing } from 'components/landing/utils';
import { COLOR_TRANSPARENT } from 'constants/colors';
import { useResponsiveBreakpoints } from 'hooks/useResponsiveBreakpoints';

/**
 * Landing page header component
 * Displays the BearlyMail logo and Sign In button
 */
export const LandingHeader: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const breakpoints = useResponsiveBreakpoints();

  const horizontalPadding = getResponsiveSpacing(breakpoints, {
    mobile: theme.spacing.md,
    tablet: theme.spacing.lg,
    desktop: theme.spacing['2xl'],
  });

  const logoHeight = breakpoints.isMobile ? '28px' : '36px';

  const titleFontSize = getResponsiveFontSize(breakpoints, {
    mobile: theme.typography.fontSize.base,
    tablet: theme.typography.fontSize.xl,
    desktop: theme.typography.fontSize['2xl'],
  });

  const buttonPadding = getResponsiveSpacing(breakpoints, {
    mobile: theme.spacing.md,
    tablet: theme.spacing.lg,
    desktop: theme.spacing.lg,
  });

  const buttonFontSize = getResponsiveFontSize(breakpoints, {
    mobile: theme.typography.fontSize.sm,
    tablet: theme.typography.fontSize.base,
    desktop: theme.typography.fontSize.base,
  });

  return (
    <header
      style={{
        padding: `${theme.spacing.md} ${horizontalPadding}`,
        backgroundColor: theme.colors.background.paper,
        borderBottom: `1px solid ${theme.colors.border.light}`,
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
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: theme.spacing.sm,
          }}
        >
          <img
            src="/favicon.svg"
            alt={t('landing.bearlyMailIcon')}
            style={{
              height: logoHeight,
              width: 'auto',
              objectFit: 'contain',
            }}
          />
          <h1
            style={{
              color: theme.colors.primary.main,
              fontSize: titleFontSize,
              fontWeight: theme.typography.fontWeight.bold,
            }}
          >
            {t('common.appName')}
          </h1>
        </div>
        <button
          onClick={() => navigate('/login')}
          style={{
            padding: `${theme.spacing.xs} ${buttonPadding}`,
            backgroundColor: COLOR_TRANSPARENT,
            color: theme.colors.primary.main,
            border: `1px solid ${theme.colors.primary.main}`,
            borderRadius: theme.borderRadius.md,
            cursor: 'pointer',
            fontWeight: theme.typography.fontWeight.medium,
            fontSize: buttonFontSize,
            whiteSpace: 'nowrap',
          }}
        >
          {t('auth.signIn')}
        </button>
      </div>
    </header>
  );
};
