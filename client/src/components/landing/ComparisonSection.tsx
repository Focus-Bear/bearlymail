import React from 'react';
import { theme } from '../../theme/theme';
import { useResponsiveBreakpoints } from '../../hooks/useResponsiveBreakpoints';
import { ComparisonTable } from './ComparisonTable';
import { ComparisonHighlightBox } from './ComparisonHighlightBox';
import {
  getSectionMarginBottom,
  getHeadingFontSize,
  getResponsiveFontSize,
  getResponsiveSpacing,
} from './utils';

/**
 * Comparison section component
 * Shows how BearlyMail differs from competitors
 */
export const ComparisonSection: React.FC = () => {
  const breakpoints = useResponsiveBreakpoints();

  const comparisonRows = [
    {
      label: 'Email delivery',
      bearlyMail: 'Scheduled batches you control',
      superhuman: 'Real-time (constant interruptions)',
      gmail: 'Real-time',
    },
    {
      label: 'Urgent filtering',
      bearlyMail: 'AI learns & breaks through batches',
      superhuman: 'Manual category splits',
      gmail: 'Basic algorithm',
    },
    {
      label: 'Prioritization',
      bearlyMail: 'Automatic (learns from your behavior)',
      superhuman: 'Manual triage required',
      gmail: 'Static filters',
    },
    {
      label: 'Philosophy',
      bearlyMail: 'Prevention > Speed',
      superhuman: 'Speed > Prevention',
      gmail: 'Sorting > Prevention',
    },
  ];

  const headingFontSize = getHeadingFontSize(breakpoints, 'h2');
  const introFontSize = getResponsiveFontSize(breakpoints, {
    mobile: theme.typography.fontSize.base,
    tablet: theme.typography.fontSize.base,
    desktop: theme.typography.fontSize.lg,
  });

  const headingMarginBottom = getResponsiveSpacing(breakpoints, {
    mobile: theme.spacing.md,
    tablet: theme.spacing.lg,
    desktop: theme.spacing.lg,
  });

  const introMarginBottom = getResponsiveSpacing(breakpoints, {
    mobile: theme.spacing.md,
    tablet: theme.spacing.xl,
    desktop: theme.spacing.xl,
  });

  return (
    <section
      style={{
        marginBottom: getSectionMarginBottom(breakpoints),
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
        Why BearlyMail is different
      </h2>
      <p
        style={{
          fontSize: introFontSize,
          color: theme.colors.text.secondary,
          marginBottom: introMarginBottom,
          lineHeight: 1.8,
          wordWrap: 'break-word',
          overflowWrap: 'break-word',
          maxWidth: '100%',
          whiteSpace: 'normal',
        }}
      >
        <strong style={{ color: theme.colors.text.primary }}>Superhuman asks:</strong> How fast can you clear your inbox?
        {breakpoints.isMobile ? ' ' : <><br />{' '}</>}
        <strong style={{ color: theme.colors.primary.main }}>BearlyMail asks:</strong> How rarely should you need to open it?
      </p>

      {!breakpoints.isMobile && <ComparisonTable rows={comparisonRows} />}

      <ComparisonHighlightBox />
    </section>
  );
};

