import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { COLOR_NAMED_WHITE, COLOR_TRANSPARENT } from 'constants/colors';
import { STRING_NONE } from 'constants/strings';

interface TourStep {
  title: string;
  content: string;
}

interface TourModalContentProps {
  tourStep: number;
  tourSteps: TourStep[];
  isLastStep: boolean;
  onSkipTour: () => void;
  onNextTourStep: () => void;
}

export const TourModalContent: React.FC<TourModalContentProps> = ({
  tourStep,
  tourSteps,
  isLastStep,
  onSkipTour,
  onNextTourStep,
}) => {
  const { t } = useTranslation();

  return (
    <div
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        backgroundColor: theme.colors.background.paper,
        padding: theme.spacing['2xl'],
        borderRadius: theme.borderRadius.lg,
        boxShadow: theme.shadows.xl,
        maxWidth: '500px',
        textAlign: 'center',
        zIndex: 1002,
      }}
    >
      <h2 style={{ marginBottom: theme.spacing.md, color: theme.colors.text.primary }}>{tourSteps[tourStep].title}</h2>
      <p
        style={{
          marginBottom: theme.spacing.xl,
          color: theme.colors.text.secondary,
          lineHeight: 1.6,
        }}
      >
        {tourSteps[tourStep].content}
      </p>

      <div style={{ display: 'flex', gap: theme.spacing.md, justifyContent: 'center' }}>
        <button
          onClick={onSkipTour}
          style={{
            padding: `${theme.spacing.md} ${theme.spacing.lg}`,
            backgroundColor: COLOR_TRANSPARENT,
            color: theme.colors.text.secondary,
            border: `1px solid ${theme.colors.border.medium}`,
            borderRadius: theme.borderRadius.md,
            cursor: 'pointer',
          }}
        >
          {t('onboarding.tour.skip')}
        </button>
        <button
          onClick={onNextTourStep}
          style={{
            padding: `${theme.spacing.md} ${theme.spacing.lg}`,
            backgroundColor: theme.colors.primary.main,
            color: COLOR_NAMED_WHITE,
            border: STRING_NONE,
            borderRadius: theme.borderRadius.md,
            cursor: 'pointer',
            fontWeight: theme.typography.fontWeight.semibold,
          }}
        >
          {isLastStep ? t('onboarding.tour.finish') : t('onboarding.tour.next')}
        </button>
      </div>
      <div
        style={{
          marginTop: theme.spacing.md,
          fontSize: theme.typography.fontSize.sm,
          color: theme.colors.text.tertiary,
        }}
      >
        {t('onboarding.tour.stepProgress', { current: tourStep + 1, total: tourSteps.length })}
      </div>
    </div>
  );
};
