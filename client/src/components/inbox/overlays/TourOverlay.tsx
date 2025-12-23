import React, { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from '../../../theme/theme';

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
  const { t } = useTranslation();

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
      {/* Dynamic highlight overlay */}
      {targetElement && (() => {
        const rect = targetElement.getBoundingClientRect();
        return (
          <div
            style={{
              position: 'fixed',
              top: rect.top - 4,
              left: rect.left - 4,
              width: rect.width + 8,
              height: rect.height + 8,
              border: `3px solid ${theme.colors.primary.main}`,
              borderRadius: theme.borderRadius.full,
              boxShadow: `0 0 0 4px rgba(59, 130, 246, 0.3)`,
              pointerEvents: 'none',
              zIndex: 1001,
            }}
          />
        );
      })()}
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
        <h2 style={{ marginBottom: theme.spacing.md, color: theme.colors.text.primary }}>
          {tourSteps[tourStep].title}
        </h2>
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
              backgroundColor: 'transparent',
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
              color: 'white',
              border: 'none',
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
    </div>
  );
};

