import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { FeatureCard } from 'components/landing/FeatureCard';
import { getHeadingFontSize, getResponsiveSpacing, getSectionMarginBottom } from 'components/landing/utils';
import { useResponsiveBreakpoints } from 'hooks/useResponsiveBreakpoints';

/**
 * How it works section component
 * Displays all the key features of BearlyMail
 */
export const HowItWorksSection: React.FC = () => {
  const { t } = useTranslation();
  const breakpoints = useResponsiveBreakpoints();

  const features = [
    {
      id: 'urgent-emails',
      title: 'Truly urgent emails break through immediately',
      description: [
        "Client emergency at 2pm? You'll see it instantly. Newsletter from that SaaS tool? Batched until your next scheduled delivery.",
        'Our AI learns what\'s urgent to you by analyzing your email history—how quickly you reply, which senders you prioritize, what you immediately archive. High barrier for "urgent" means only what genuinely matters interrupts your flow.',
      ],
      borderColor: theme.colors.primary.main,
      emoji: '⚡',
    },
    {
      id: 'scheduled-delivery',
      title: 'Everything else arrives on your schedule',
      description: [
        "Choose when emails get delivered: 2x, 3x, or 4x daily. Set quiet hours—no email before 10am, none after 6pm. Block off entire weekends. You're in complete control.",
        'Your inbox becomes a planned task, not a constant distraction.',
      ],
      borderColor: theme.colors.secondary.main,
      emoji: '⏰',
    },
    {
      id: 'prioritization',
      title: 'See what matters first, one action at a time',
      description:
        "Every batch is automatically ranked 0-100 by importance based on your behavior patterns. Deal with the CEO's question first, not the Zoom recording notification.",
      borderColor: theme.colors.accent.info,
      emoji: '🎯',
    },
    {
      id: 'workflow',
      title: 'Triage → Process workflow',
      description:
        'New emails go to Triage for quick decisions. Starred emails move to Process for focused work. No more endless scrolling to find what needs attention.',
      borderColor: theme.colors.accent.success,
      emoji: '🔄',
    },
    {
      id: 'snoozing',
      title: 'Smart snoozing that actually works',
      description: 'Type "2h" or "tomorrow" to snooze. No calendar navigation, no complex scheduling.',
      borderColor: theme.colors.accent.warning,
      emoji: '😴',
    },
  ];

  const headingFontSize = getHeadingFontSize(breakpoints, 'h2');
  const headingMarginBottom = getResponsiveSpacing(breakpoints, {
    mobile: theme.spacing.md,
    tablet: theme.spacing.lg,
    desktop: theme.spacing['2xl'],
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
        {t('landing.howItWorks.heading')}
      </h2>
      {features.map(feature => (
        <FeatureCard
          key={feature.id}
          cardKey={feature.id}
          title={t(`landing.howItWorks.features.${feature.id}.title`)}
          description={
            Array.isArray(feature.description)
              ? feature.description.map((_, idx) => t(`landing.howItWorks.features.${feature.id}.description.${idx}`))
              : t(`landing.howItWorks.features.${feature.id}.description`)
          }
          borderColor={feature.borderColor}
          emoji={feature.emoji}
        />
      ))}
    </section>
  );
};
