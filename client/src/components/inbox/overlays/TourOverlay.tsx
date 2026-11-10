import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Joyride, type TooltipRenderProps } from 'react-joyride';
import { theme } from 'theme/theme';

import { TourModalContent } from 'components/inbox/overlays/TourModalContent';
import { TourStep } from 'components/inbox/overlays/tourSteps';
import { useResolvedTourSteps } from 'components/inbox/overlays/useResolvedTourSteps';
import { useTourKeyboard } from 'components/inbox/overlays/useTourKeyboard';
import { useTourNextLock } from 'components/inbox/overlays/useTourNextLock';
import { Z_INDEX_POPUP } from 'constants/numbers';
import { TOUR_NEXT_STEP_DELAY_MS } from 'constants/tour';
import { usePrefersReducedMotion } from 'hooks/usePrefersReducedMotion';

export const TOUR_SPOTLIGHT_PADDING_PX = 6;
export const TOUR_SPOTLIGHT_RADIUS_PX = 12;
const TOOLTIP_OFFSET_PX = 12;
const SCROLL_DURATION_MS = 300;
const TOOLTIP_VIEWPORT_GUTTER_PX = 16;

/**
 * Keep the card inside the viewport. Joyride otherwise bounds it by the target's
 * nearest overflow ancestor — for an email row that's the accordion body, which is
 * narrower than the card on a phone. crossAxis lets it overlap a tall target
 * instead of running off-screen when there's no room above or below.
 */
function buildFloatingOptions() {
  return {
    shiftOptions: {
      boundary: document.documentElement,
      rootBoundary: 'viewport' as const,
      padding: TOOLTIP_VIEWPORT_GUTTER_PX,
      crossAxis: true,
    },
  };
}

interface TourOverlayProps {
  tourStep: number;
  tourSteps: TourStep[];
  onSkipTour: () => void;
  onNextTourStep: () => void;
  onPrevTourStep: () => void;
  /** How long Next stays locked on a step's first showing; defaults to TOUR_NEXT_STEP_DELAY_MS. */
  nextStepDelayMs?: number;
}

interface TourControls extends TourOverlayProps {
  isNextLocked: boolean;
  isSkipPromptVisible: boolean;
  onRequestSkip: () => void;
  onCancelSkip: () => void;
}

/**
 * Joyride renders the tooltip component itself (inside its portal), so the
 * step state and handlers reach it through context rather than props.
 */
const TourControlsContext = createContext<TourControls | null>(null);

/**
 * Whether the "hold to skip" prompt is showing. It closes again whenever the
 * step changes, so moving on through the tour puts the card back to normal.
 */
function useSkipPrompt(tourStep: number) {
  const [isSkipPromptVisible, setIsSkipPromptVisible] = useState(false);
  const [promptStep, setPromptStep] = useState(tourStep);
  if (promptStep !== tourStep) {
    setPromptStep(tourStep);
    setIsSkipPromptVisible(false);
  }
  const onRequestSkip = useCallback(() => setIsSkipPromptVisible(true), []);
  const onCancelSkip = useCallback(() => setIsSkipPromptVisible(false), []);
  const onToggleSkipPrompt = useCallback(() => setIsSkipPromptVisible(isVisible => !isVisible), []);
  return { isSkipPromptVisible, onRequestSkip, onCancelSkip, onToggleSkipPrompt };
}

const TourTooltip: React.FC<TooltipRenderProps> = ({ tooltipProps }) => {
  const controls = useContext(TourControlsContext);
  if (!controls) {
    return null;
  }
  const { tourStep, tourSteps, onSkipTour, onNextTourStep, onPrevTourStep } = controls;
  return (
    <TourModalContent
      tourStep={tourStep}
      tourSteps={tourSteps}
      isFirstStep={tourStep === 0}
      isLastStep={tourStep === tourSteps.length - 1}
      isSkipPromptVisible={controls.isSkipPromptVisible}
      onRequestSkip={controls.onRequestSkip}
      onCancelSkip={controls.onCancelSkip}
      onSkipTour={onSkipTour}
      isNextLocked={controls.isNextLocked}
      onNextTourStep={onNextTourStep}
      onPrevTourStep={onPrevTourStep}
      dialogProps={tooltipProps}
    />
  );
};

/**
 * Onboarding tour: dims the inbox, cuts a spotlight around the element each step
 * describes and anchors the card beside it with an arrow (Joyride handles the
 * cut-out, scroll-into-view and repositioning on resize/scroll). A step whose
 * element isn't on screen falls back to a centred card.
 */
export const TourOverlay: React.FC<TourOverlayProps> = props => {
  const { tourStep, tourSteps, onNextTourStep, onPrevTourStep, nextStepDelayMs = TOUR_NEXT_STEP_DELAY_MS } = props;
  const prefersReducedMotion = usePrefersReducedMotion();
  const { isSkipPromptVisible, onRequestSkip, onCancelSkip, onToggleSkipPrompt } = useSkipPrompt(tourStep);
  const isNextLocked = useTourNextLock(tourStep, nextStepDelayMs);
  // The Next button, → and Enter all go through this, so none of them can skip the wait.
  const onNextWhenUnlocked = useCallback(() => {
    if (!isNextLocked) {
      onNextTourStep();
    }
  }, [isNextLocked, onNextTourStep]);

  useTourKeyboard({
    isFirstStep: tourStep === 0,
    onEscape: onToggleSkipPrompt,
    onNext: onNextWhenUnlocked,
    onPrev: onPrevTourStep,
  });

  const controls = useMemo<TourControls>(
    () => ({
      ...props,
      onNextTourStep: onNextWhenUnlocked,
      isNextLocked,
      isSkipPromptVisible,
      onRequestSkip,
      onCancelSkip,
    }),
    [props, onNextWhenUnlocked, isNextLocked, isSkipPromptVisible, onRequestSkip, onCancelSkip]
  );

  const steps = useResolvedTourSteps(tourSteps, tourStep);
  const floatingOptions = useMemo(buildFloatingOptions, []);

  return (
    <TourControlsContext.Provider value={controls}>
      <Joyride
        run
        continuous
        stepIndex={tourStep}
        steps={steps}
        tooltipComponent={TourTooltip}
        floatingOptions={floatingOptions}
        options={{
          zIndex: Z_INDEX_POPUP,
          overlayColor: theme.colors.overlay.dark,
          backgroundColor: theme.colors.background.paper,
          primaryColor: theme.colors.primary.main,
          spotlightPadding: TOUR_SPOTLIGHT_PADDING_PX,
          spotlightRadius: TOUR_SPOTLIGHT_RADIUS_PX,
          offset: TOOLTIP_OFFSET_PX,
          skipBeacon: true,
          blockTargetInteraction: true,
          // Esc and overlay clicks are handled by useTourKeyboard / the hold-to-skip prompt.
          dismissKeyAction: false,
          overlayClickAction: false,
          scrollDuration: prefersReducedMotion ? 0 : SCROLL_DURATION_MS,
        }}
      />
    </TourControlsContext.Provider>
  );
};
