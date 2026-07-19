import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { getResponsiveFontSize } from 'components/landing/utils';
import { useResponsiveBreakpoints } from 'hooks/useResponsiveBreakpoints';

export const FounderHeader: React.FC = () => {
  const { t } = useTranslation();
  const breakpoints = useResponsiveBreakpoints();

  const photoSize = (() => {
    if (breakpoints.isMobile) {
      return '80px';
    }
    if (breakpoints.isTablet) {
      return '100px';
    }
    return '120px';
  })();

  const signatureFontSize = getResponsiveFontSize(breakpoints, {
    mobile: theme.typography.fontSize.base,
    tablet: theme.typography.fontSize.base,
    desktop: theme.typography.fontSize.lg,
  });

  const bodyFontSize = getResponsiveFontSize(breakpoints, {
    mobile: theme.typography.fontSize.base,
    tablet: theme.typography.fontSize.base,
    desktop: theme.typography.fontSize.lg,
  });

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: theme.spacing.md,
        marginBottom: theme.spacing.lg,
        flexDirection: breakpoints.isMobile ? 'column' : 'row',
      }}
    >
      <div
        style={{
          width: photoSize,
          height: photoSize,
          borderRadius: '50%',
          border: `3px solid ${theme.colors.primary.main}`,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors.primary.subtle,
          color: theme.colors.primary.main,
          fontSize: breakpoints.isMobile ? theme.typography.fontSize.lg : theme.typography.fontSize.xl,
          fontWeight: theme.typography.fontWeight.bold,
        }}
      >
        JN
      </div>
      <div>
        <p
          style={{
            fontSize: signatureFontSize,
            fontWeight: theme.typography.fontWeight.semibold,
            color: theme.colors.text.primary,
            marginBottom: theme.spacing.xs,
            marginTop: 0,
          }}
        >
          {t('landing.founder.name')}
        </p>
        <p
          style={{
            fontSize: bodyFontSize,
            color: theme.colors.text.secondary,
            marginBottom: 0,
          }}
        >
          {t('landing.founder.title')}
        </p>
      </div>
    </div>
  );
};
