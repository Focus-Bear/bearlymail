import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { getResponsiveFontSize, getResponsiveSpacing } from 'components/landing/utils';
import { useResponsiveBreakpoints } from 'hooks/useResponsiveBreakpoints';

export const FounderStoryContent: React.FC = () => {
  const { t } = useTranslation();
  const breakpoints = useResponsiveBreakpoints();

  const bodyFontSize = getResponsiveFontSize(breakpoints, {
    mobile: theme.typography.fontSize.base,
    tablet: theme.typography.fontSize.base,
    desktop: theme.typography.fontSize.lg,
  });

  const paragraphMarginBottom = getResponsiveSpacing(breakpoints, {
    mobile: theme.spacing.md,
    tablet: theme.spacing.lg,
    desktop: theme.spacing.lg,
  });

  const paragraphStyle = {
    fontSize: bodyFontSize,
    color: theme.colors.text.secondary,
    lineHeight: 1.8,
    wordWrap: 'break-word' as const,
    overflowWrap: 'break-word' as const,
    whiteSpace: 'normal' as const,
  };

  if (breakpoints.isMobile) {
    return (
      <>
        <p style={{ ...paragraphStyle, marginBottom: paragraphMarginBottom, fontStyle: 'italic' }}>
          {t('landing.founder.story.mobile.paragraph1')}
        </p>
        <p style={{ ...paragraphStyle, marginBottom: paragraphMarginBottom }}>
          {t('landing.founder.story.mobile.paragraph2')}
        </p>
        <p style={{ ...paragraphStyle, marginBottom: paragraphMarginBottom }}>
          {t('landing.founder.story.mobile.paragraph3')}
        </p>
        <p style={{ ...paragraphStyle, marginBottom: 0, fontWeight: theme.typography.fontWeight.medium }}>
          {t('landing.founder.story.mobile.paragraph4')} 🐻
        </p>
      </>
    );
  }

  return (
    <>
      <p style={{ ...paragraphStyle, marginBottom: paragraphMarginBottom, fontStyle: 'italic' }}>
        {t('landing.founder.story.desktop.paragraph1')}
      </p>
      <p style={{ ...paragraphStyle, marginBottom: paragraphMarginBottom }}>
        {t('landing.founder.story.desktop.paragraph2')}
      </p>
      <p style={{ ...paragraphStyle, marginBottom: paragraphMarginBottom }}>
        {t('landing.founder.story.desktop.paragraph3')}
      </p>
      <p style={{ ...paragraphStyle, marginBottom: paragraphMarginBottom }}>
        {t('landing.founder.story.desktop.paragraph4')}
      </p>
      <p style={{ ...paragraphStyle, marginBottom: paragraphMarginBottom }}>
        {t('landing.founder.story.desktop.paragraph5')}
      </p>
      <p style={{ ...paragraphStyle, marginBottom: paragraphMarginBottom }}>
        {t('landing.founder.story.desktop.paragraph6')}
      </p>
      <p style={{ ...paragraphStyle, marginBottom: paragraphMarginBottom }}>
        {t('landing.founder.story.desktop.paragraph7')}
      </p>
      <p
        style={{
          ...paragraphStyle,
          marginBottom: paragraphMarginBottom,
          fontWeight: theme.typography.fontWeight.medium,
        }}
      >
        {t('landing.founder.story.desktop.paragraph8')}
      </p>
      <p style={{ ...paragraphStyle, marginBottom: paragraphMarginBottom }}>
        {t('landing.founder.story.desktop.paragraph9')}
      </p>
      <p style={{ ...paragraphStyle, marginBottom: paragraphMarginBottom }}>
        {t('landing.founder.story.desktop.paragraph10')}
      </p>
      <p style={{ ...paragraphStyle, marginBottom: 0, fontWeight: theme.typography.fontWeight.medium }}>
        {t('landing.founder.story.desktop.paragraph11')} 🐻
      </p>
    </>
  );
};
