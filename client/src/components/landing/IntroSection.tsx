import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import {
  getHeadingFontSize,
  getResponsiveFontSize,
  getResponsiveSpacing,
  getSectionMarginBottom,
} from 'components/landing/utils';
import { useResponsiveBreakpoints } from 'hooks/useResponsiveBreakpoints';

type BreakpointHook = ReturnType<typeof useResponsiveBreakpoints>;

function useIntroStyles(breakpoints: BreakpointHook) {
  const bodyFontSize = getResponsiveFontSize(breakpoints, {
    mobile: theme.typography.fontSize.base,
    tablet: theme.typography.fontSize.base,
    desktop: theme.typography.fontSize.lg,
  });
  const subHeadingFontSize = getResponsiveFontSize(breakpoints, {
    mobile: theme.typography.fontSize.lg,
    tablet: theme.typography.fontSize.xl,
    desktop: theme.typography.fontSize.xl,
  });
  return {
    mainHeadingFontSize: getHeadingFontSize(breakpoints, 'h2'),
    headingMarginBottom: getResponsiveSpacing(breakpoints, {
      mobile: theme.spacing.md,
      tablet: theme.spacing.lg,
      desktop: theme.spacing.lg,
    }),
    sectionGap: getResponsiveSpacing(breakpoints, {
      mobile: theme.spacing.lg,
      tablet: theme.spacing.xl,
      desktop: theme.spacing.xl,
    }),
    paragraphStyle: {
      fontSize: bodyFontSize,
      color: theme.colors.text.secondary,
      lineHeight: 1.8,
      wordWrap: 'break-word' as const,
      overflowWrap: 'break-word' as const,
      maxWidth: '100%',
      marginBottom: theme.spacing.md,
    },
    subSectionHeadingStyle: {
      fontSize: subHeadingFontSize,
      fontWeight: theme.typography.fontWeight.semibold,
      color: theme.colors.text.primary,
      marginBottom: theme.spacing.sm,
      marginTop: 0,
    },
    subheadingStyle: {
      fontSize: bodyFontSize,
      fontStyle: 'italic' as const,
      color: theme.colors.text.secondary,
      marginBottom: theme.spacing.md,
    },
  };
}

/**
 * Introduction section component
 * Explains why BearlyMail exists with structured content
 */
export const IntroSection: React.FC = () => {
  const { t } = useTranslation();
  const breakpoints = useResponsiveBreakpoints();

  const {
    mainHeadingFontSize,
    headingMarginBottom,
    sectionGap,
    paragraphStyle,
    subSectionHeadingStyle,
    subheadingStyle,
  } = useIntroStyles(breakpoints);

  return (
    <section
      style={{
        marginBottom: getSectionMarginBottom(breakpoints),
      }}
    >
      <h2
        style={{
          fontSize: mainHeadingFontSize,
          fontWeight: theme.typography.fontWeight.bold,
          color: theme.colors.text.primary,
          marginBottom: headingMarginBottom,
        }}
      >
        {t('landing.intro.heading')}
      </h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: sectionGap }}>
        <div>
          <h3 style={subSectionHeadingStyle}>{t('landing.intro.sections.emailIsBroken.heading')}</h3>
          <p style={subheadingStyle}>{t('landing.intro.sections.emailIsBroken.subheading')}</p>
          <p style={{ ...paragraphStyle, marginBottom: 0 }}>{t('landing.intro.sections.emailIsBroken.paragraph')}</p>
        </div>

        <div>
          <h3 style={subSectionHeadingStyle}>{t('landing.intro.sections.newestNotImportant.heading')}</h3>
          <p style={paragraphStyle}>{t('landing.intro.sections.newestNotImportant.paragraph1')}</p>
          <p style={{ ...paragraphStyle, marginBottom: 0 }}>
            {t('landing.intro.sections.newestNotImportant.paragraph2')}
          </p>
        </div>

        <div>
          <h3 style={subSectionHeadingStyle}>{t('landing.intro.sections.notTimeSensitive.heading')}</h3>
          <p style={paragraphStyle}>{t('landing.intro.sections.notTimeSensitive.paragraph1')}</p>
          <p style={{ ...paragraphStyle, marginBottom: 0 }}>
            {t('landing.intro.sections.notTimeSensitive.paragraph2')}
          </p>
        </div>

        <div>
          <h3 style={subSectionHeadingStyle}>{t('landing.intro.sections.webelieve.heading')}</h3>
          <p style={paragraphStyle}>{t('landing.intro.sections.webelieve.paragraph1')}</p>
          <p style={{ ...paragraphStyle, marginBottom: 0, fontWeight: theme.typography.fontWeight.medium }}>
            {t('landing.intro.sections.webelieve.paragraph2')}
          </p>
        </div>
      </div>
    </section>
  );
};
