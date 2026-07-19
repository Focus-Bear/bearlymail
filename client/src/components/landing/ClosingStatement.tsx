import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { ClosingStatementContent } from 'components/landing/ClosingStatementContent';
import { CTAButton } from 'components/landing/CTAButton';
import { getHeadingFontSize, getResponsiveSpacing } from 'components/landing/utils';
import { useResponsiveBreakpoints } from 'hooks/useResponsiveBreakpoints';

/**
 * Closing statement section component
 * Final call to action and value proposition
 */
export const ClosingStatement: React.FC = () => {
  const { t } = useTranslation();
  const breakpoints = useResponsiveBreakpoints();

  const scrollToWaitlist = () => {
    const formElement = document.getElementById('waitlist-form');
    formElement?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const sectionMarginBottom = getResponsiveSpacing(breakpoints, {
    mobile: theme.spacing.xl,
    tablet: theme.spacing['2xl'],
    desktop: theme.spacing['3xl'],
  });

  const sectionPadding = getResponsiveSpacing(breakpoints, {
    mobile: theme.spacing.lg,
    tablet: theme.spacing.lg,
    desktop: theme.spacing['2xl'],
  });

  const headingFontSize = getHeadingFontSize(breakpoints, 'h2');
  const headingMarginBottom = getResponsiveSpacing(breakpoints, {
    mobile: theme.spacing.md,
    tablet: theme.spacing.lg,
    desktop: theme.spacing.lg,
  });

  return (
    <section
      style={{
        marginBottom: sectionMarginBottom,
        padding: sectionPadding,
        backgroundColor: theme.colors.background.paper,
        borderRadius: theme.borderRadius.lg,
      }}
    >
      <h2
        style={{
          fontSize: headingFontSize,
          fontWeight: theme.typography.fontWeight.bold,
          color: theme.colors.text.primary,
          marginBottom: headingMarginBottom,
        }}
      >
        {t('landing.closing.heading')}
      </h2>
      <ClosingStatementContent />
      {/* CTA - shown on all screen sizes */}
      <div
        style={{
          marginTop: theme.spacing.xl,
          textAlign: breakpoints.isTablet || breakpoints.isDesktop ? 'left' : 'center',
        }}
      >
        <CTAButton onClick={scrollToWaitlist}>{t('landing.closing.cta')}</CTAButton>
      </div>
    </section>
  );
};
