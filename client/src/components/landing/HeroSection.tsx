import React from 'react';
import { theme } from '../../theme/theme';
import { useResponsiveBreakpoints } from '../../hooks/useResponsiveBreakpoints';
import { CTAButton } from './CTAButton';
import {
  getSectionMarginBottom,
  getHeroPaddingTop,
  getHeadingFontSize,
  getResponsiveFontSize,
  getResponsiveSpacing,
} from './utils';

/**
 * Hero section component
 * Displays the main headline and value proposition
 */
export const HeroSection: React.FC = () => {
  const breakpoints = useResponsiveBreakpoints();
  const { isMobile } = breakpoints;

  const scrollToWaitlist = () => {
    const formElement = document.getElementById('waitlist-form');
    formElement?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const headingFontSize = getHeadingFontSize(breakpoints, 'h1');
  const bodyFontSize = getResponsiveFontSize(breakpoints, {
    mobile: theme.typography.fontSize.base,
    tablet: theme.typography.fontSize.base,
    desktop: theme.typography.fontSize.xl,
  });
  const marginBottom = getResponsiveSpacing(breakpoints, {
    mobile: theme.spacing.md,
    tablet: theme.spacing.lg,
    desktop: theme.spacing.xl,
  });

  return (
    <section
      style={{
        marginBottom: getSectionMarginBottom(breakpoints),
        paddingTop: getHeroPaddingTop(breakpoints),
      }}
    >
      <h1
        style={{
          fontSize: headingFontSize,
          fontWeight: theme.typography.fontWeight.bold,
          color: theme.colors.text.primary,
          marginBottom,
          lineHeight: 1.2,
          wordWrap: 'break-word',
          overflowWrap: 'break-word',
          maxWidth: '100%',
          whiteSpace: 'normal',
        }}
      >
        You checked email 47 times yesterday.{isMobile ? ' ' : <><br />{' '}</>}
        Only 3 emails actually mattered.
      </h1>
      <p
        style={{
          fontSize: bodyFontSize,
          color: theme.colors.text.secondary,
          lineHeight: 1.8,
          marginBottom,
          wordWrap: 'break-word',
          overflowWrap: 'break-word',
          maxWidth: '100%',
        }}
      >
        The rest? Newsletters. Meeting confirmations. Marketing spam. But you keep checking obsessively because buried
        somewhere might be the one email that's actually urgent.
      </p>
      {/* CTA for mobile - centered */}
      {isMobile && (
        <div
          style={{
            marginTop: theme.spacing.lg,
            textAlign: 'center',
          }}
        >
          <CTAButton onClick={scrollToWaitlist}>Get Early Access</CTAButton>
        </div>
      )}
      {/* CTA for tablet/desktop - left aligned */}
      {(breakpoints.isTablet || breakpoints.isDesktop) && (
        <div
          style={{
            marginTop: theme.spacing.lg,
            textAlign: 'left',
          }}
        >
          <CTAButton onClick={scrollToWaitlist}>Get Early Access</CTAButton>
        </div>
      )}
    </section>
  );
};

