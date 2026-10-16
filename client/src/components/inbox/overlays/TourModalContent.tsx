import React, { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { COLOR_NAMED_WHITE, COLOR_TRANSPARENT } from 'constants/colors';
import { STRING_NONE } from 'constants/strings';

interface TourStepCopy {
  title: string;
  content: string;
}

// Fixed width on desktop, never wider than a phone screen minus its gutters.
const CARD_WIDTH = 'min(360px, calc(100vw - 32px))';

interface TourModalContentProps {
  tourStep: number;
  tourSteps: TourStepCopy[];
  isLastStep: boolean;
  isFirstStep: boolean;
  onSkipTour: () => void;
  onNextTourStep: () => void;
  onPrevTourStep: () => void;
  /** Dialog semantics supplied by the positioning layer (Joyride's tooltipProps). */
  dialogProps?: { role: string; 'aria-modal': boolean };
}

const secondaryButtonStyle: React.CSSProperties = {
  padding: `${theme.spacing.sm} ${theme.spacing.md}`,
  backgroundColor: COLOR_TRANSPARENT,
  color: theme.colors.text.secondary,
  border: `1px solid ${theme.colors.border.medium}`,
  borderRadius: theme.borderRadius.md,
  cursor: 'pointer',
};

/**
 * The tour card: step title, copy, Skip/Back/Next and progress. Placement (next
 * to the spotlit element, or centred) is handled by the TourOverlay.
 */
export const TourModalContent: React.FC<TourModalContentProps> = ({
  tourStep,
  tourSteps,
  isLastStep,
  isFirstStep,
  onSkipTour,
  onNextTourStep,
  onPrevTourStep,
  dialogProps,
}) => {
  const { t } = useTranslation();
  const titleId = useId();
  const contentId = useId();

  return (
    <div
      role={dialogProps?.role ?? 'dialog'}
      aria-modal={dialogProps?.['aria-modal'] ?? true}
      aria-labelledby={titleId}
      aria-describedby={contentId}
      style={{
        // Joyride portals the card to <body>, outside the app's font scope.
        fontFamily: theme.typography.fontFamily,
        backgroundColor: theme.colors.background.paper,
        padding: theme.spacing.lg,
        borderRadius: theme.borderRadius.lg,
        boxShadow: theme.shadows.xl,
        boxSizing: 'border-box',
        width: CARD_WIDTH,
        textAlign: 'left',
      }}
    >
      <h2
        id={titleId}
        style={{
          margin: `0 0 ${theme.spacing.sm}`,
          fontSize: theme.typography.fontSize.xl,
          color: theme.colors.text.primary,
        }}
      >
        {tourSteps[tourStep].title}
      </h2>
      <p
        id={contentId}
        style={{
          margin: `0 0 ${theme.spacing.lg}`,
          color: theme.colors.text.secondary,
          lineHeight: 1.6,
        }}
      >
        {tourSteps[tourStep].content}
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm }}>
        <span
          style={{
            marginRight: 'auto',
            fontSize: theme.typography.fontSize.sm,
            color: theme.colors.text.tertiary,
          }}
        >
          {t('onboarding.tour.stepProgress', { current: tourStep + 1, total: tourSteps.length })}
        </span>
        <button type="button" onClick={onSkipTour} style={secondaryButtonStyle}>
          {t('onboarding.tour.skip')}
        </button>
        {!isFirstStep && (
          <button type="button" onClick={onPrevTourStep} style={secondaryButtonStyle}>
            {t('onboarding.tour.back')}
          </button>
        )}
        <button
          type="button"
          // Focus lands on Next so Enter advances the tour.
          autoFocus
          onClick={onNextTourStep}
          style={{
            padding: `${theme.spacing.sm} ${theme.spacing.md}`,
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
    </div>
  );
};
