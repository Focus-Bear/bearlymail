import React, { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { TourHoldToSkipButton } from 'components/inbox/overlays/TourHoldToSkipButton';
import { COLOR_NAMED_WHITE, COLOR_TRANSPARENT } from 'constants/colors';
import { MS_PER_SECOND } from 'constants/numbers';
import { STRING_NONE } from 'constants/strings';
import { TOUR_SKIP_HOLD_DURATION_MS } from 'constants/tour';

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
  /** Skip was clicked (or Esc pressed): show the "we recommend the tour — hold to skip" prompt. */
  isSkipPromptVisible: boolean;
  onRequestSkip: () => void;
  onCancelSkip: () => void;
  /** Only reached by completing the press-and-hold. */
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

const skipPromptStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: theme.spacing.sm,
  marginTop: theme.spacing.md,
  padding: theme.spacing.md,
  backgroundColor: theme.colors.background.subtle,
  border: `1px solid ${theme.colors.border.light}`,
  borderRadius: theme.borderRadius.md,
};

const skipPromptMessageStyle: React.CSSProperties = {
  margin: 0,
  fontSize: theme.typography.fontSize.sm,
  color: theme.colors.text.primary,
  lineHeight: 1.5,
};

const linkButtonStyle: React.CSSProperties = {
  ...secondaryButtonStyle,
  border: STRING_NONE,
  textDecoration: 'underline',
};

const SKIP_HOLD_SECONDS = Math.round(TOUR_SKIP_HOLD_DURATION_MS / MS_PER_SECOND);

/**
 * Shown instead of skipping outright: BearlyMail works quite differently from
 * other email clients, so it asks the user to stay and makes skipping a
 * deliberate 10-second hold.
 */
const SkipPrompt: React.FC<{ onSkipTour: () => void; onCancelSkip: () => void }> = ({ onSkipTour, onCancelSkip }) => {
  const { t } = useTranslation();
  const messageId = useId();
  return (
    <div role="group" aria-labelledby={messageId} data-testid="tour-skip-prompt" style={skipPromptStyle}>
      <p id={messageId} style={skipPromptMessageStyle}>
        {t('onboarding.tourSkipPrompt.message', { count: SKIP_HOLD_SECONDS })}
      </p>
      <TourHoldToSkipButton onSkip={onSkipTour} describedById={messageId} />
      <button type="button" onClick={onCancelSkip} style={{ ...linkButtonStyle, alignSelf: 'center' }}>
        {t('onboarding.tourSkipPrompt.continueTour')}
      </button>
    </div>
  );
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
  isSkipPromptVisible,
  onRequestSkip,
  onCancelSkip,
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
      {isSkipPromptVisible ? (
        <SkipPrompt onSkipTour={onSkipTour} onCancelSkip={onCancelSkip} />
      ) : (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: theme.spacing.sm }}>
          <button type="button" onClick={onRequestSkip} style={linkButtonStyle}>
            {t('onboarding.tour.skip')}
          </button>
        </div>
      )}
    </div>
  );
};
