import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { getResponsiveFontSize, getResponsiveSpacing } from 'components/landing/utils';
import { useResponsiveBreakpoints } from 'hooks/useResponsiveBreakpoints';

/**
 * Content paragraphs for closing statement
 */
export const ClosingStatementContent: React.FC = () => {
  const { t } = useTranslation();
  const breakpoints = useResponsiveBreakpoints();

  const bodyFontSize = getResponsiveFontSize(breakpoints, {
    mobile: theme.typography.fontSize.base,
    tablet: theme.typography.fontSize.base,
    desktop: theme.typography.fontSize.xl,
  });

  const italicFontSize = getResponsiveFontSize(breakpoints, {
    mobile: theme.typography.fontSize.base,
    tablet: theme.typography.fontSize.base,
    desktop: theme.typography.fontSize.lg,
  });

  const paragraphMarginBottom = getResponsiveSpacing(breakpoints, {
    mobile: theme.spacing.md,
    tablet: theme.spacing.lg,
    desktop: theme.spacing.lg,
  });

  const italicMarginTop = getResponsiveSpacing(breakpoints, {
    mobile: theme.spacing.lg,
    tablet: theme.spacing.xl,
    desktop: theme.spacing.xl,
  });

  return (
    <>
      <p
        style={{
          fontSize: bodyFontSize,
          color: theme.colors.text.secondary,
          lineHeight: 1.8,
          marginBottom: paragraphMarginBottom,
          maxWidth: '100%',
        }}
      >
        {t('landing.closing.content.paragraph1')}
      </p>
      <p
        style={{
          fontSize: bodyFontSize,
          color: theme.colors.text.secondary,
          lineHeight: 1.8,
          marginBottom: paragraphMarginBottom,
          maxWidth: '100%',
        }}
      >
        {t('landing.closing.content.paragraph2')}
      </p>
      <p
        style={{
          fontSize: italicFontSize,
          color: theme.colors.primary.main,
          fontWeight: theme.typography.fontWeight.medium,
          marginTop: italicMarginTop,
          fontStyle: 'italic',
        }}
      >
        {t('landing.closing.content.paragraph3')}
      </p>
    </>
  );
};
