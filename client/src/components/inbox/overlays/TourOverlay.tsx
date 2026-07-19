import React, { RefObject } from 'react';

import { TourHighlightOverlay } from 'components/inbox/overlays/TourHighlightOverlay';
import { TourModalContent } from 'components/inbox/overlays/TourModalContent';

interface TourStep {
  title: string;
  content: string;
}

interface TourOverlayProps {
  tourStep: number;
  tourSteps: TourStep[];
  onSkipTour: () => void;
  onNextTourStep: () => void;
  triageTabRef: RefObject<HTMLButtonElement | null>;
  actionTabRef: RefObject<HTMLButtonElement | null>;
  deliverBtnRef: RefObject<HTMLButtonElement | null>;
}

/**
 * Tour overlay component
 * Displays onboarding tour steps with highlights
 */
export const TourOverlay: React.FC<TourOverlayProps> = ({
  tourStep,
  tourSteps,
  onSkipTour,
  onNextTourStep,
  triageTabRef,
  actionTabRef,
  deliverBtnRef,
}) => {
  const getTargetElement = (): HTMLElement | null => {
    if (tourStep === 1 && triageTabRef.current) {
      return triageTabRef.current;
    }
    if (tourStep === 2 && actionTabRef.current) {
      return actionTabRef.current;
    }
    if (tourStep === 3 && deliverBtnRef.current) {
      return deliverBtnRef.current;
    }
    return null;
  };

  const targetElement = getTargetElement();
  const isLastStep = tourStep === tourSteps.length - 1;

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        zIndex: 1000,
      }}
    >
      {targetElement && <TourHighlightOverlay targetElement={targetElement} />}
      <TourModalContent
        tourStep={tourStep}
        tourSteps={tourSteps}
        isLastStep={isLastStep}
        onSkipTour={onSkipTour}
        onNextTourStep={onNextTourStep}
      />
    </div>
  );
};
