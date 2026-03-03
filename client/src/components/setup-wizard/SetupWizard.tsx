import React, { useState, useCallback } from 'react';
import { theme } from 'theme/theme';
import { WelcomeStep } from './WelcomeStep';
import { ContextAnalysisStep } from './ContextAnalysisStep';
import { EmailImportStep } from './EmailImportStep';
import axios from 'axios';
import { API_URL } from 'config/api';
import { SETUP_STEP_WELCOME, SETUP_STEP_CONTEXT_ANALYSIS, SETUP_STEP_EMAIL_IMPORT } from 'constants/strings';

interface SetupWizardProps {
  onComplete: () => void;
  refreshUser: () => Promise<void>;
}

type WizardStep = typeof SETUP_STEP_WELCOME | typeof SETUP_STEP_CONTEXT_ANALYSIS | typeof SETUP_STEP_EMAIL_IMPORT;

export const SetupWizard: React.FC<SetupWizardProps> = ({ onComplete, refreshUser }) => {

  const [currentStep, setCurrentStep] = useState<WizardStep>(SETUP_STEP_WELCOME);
  const [isLoading, setIsLoading] = useState(false);

  const handleWelcomeComplete = useCallback(async () => {
    setCurrentStep(SETUP_STEP_CONTEXT_ANALYSIS);
  }, []);

  const handleContextAnalysisComplete = useCallback(async () => {
    setCurrentStep(SETUP_STEP_EMAIL_IMPORT);
  }, []);

  const handleEmailImportComplete = useCallback(async () => {
    setIsLoading(true);
    try {
      await axios.post(`${API_URL}/onboarding/complete`);
      await refreshUser();
      onComplete();
    } catch (error) {
      console.error('Failed to complete onboarding:', error);
    } finally {
      setIsLoading(false);
    }
  }, [onComplete, refreshUser]);

  const getStepNumber = (): number => {
    switch (currentStep) {
      case SETUP_STEP_WELCOME:
        return 1;
      case SETUP_STEP_CONTEXT_ANALYSIS:
        return 2;
      case SETUP_STEP_EMAIL_IMPORT:
        return 3;
      default:
        return 1;
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: theme.colors.background.default,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: theme.spacing.xl,
        zIndex: 9999,
      }}
    >
      <div
        style={{
          backgroundColor: theme.colors.background.paper,
          borderRadius: theme.borderRadius.lg,
          padding: theme.spacing['2xl'],
          maxWidth: '600px',
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: theme.shadows.xl,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            marginBottom: theme.spacing.lg,
          }}
        >
          <div style={{ display: 'flex', gap: theme.spacing.sm, alignItems: 'center' }}>
            {[1, 2, 3].map((step) => (
              <React.Fragment key={step}>
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    backgroundColor:
                      step <= getStepNumber()
                        ? theme.colors.primary.main
                        : theme.colors.border.light,
                    color: step <= getStepNumber() ? 'white' : theme.colors.text.secondary,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: theme.typography.fontWeight.semibold,
                    fontSize: theme.typography.fontSize.sm,
                  }}
                >
                  {step}
                </div>
                {step < 3 && (
                  <div
                    style={{
                      width: '40px',
                      height: '2px',
                      backgroundColor:
                        step < getStepNumber()
                          ? theme.colors.primary.main
                          : theme.colors.border.light,
                    }}
                  />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {currentStep === SETUP_STEP_WELCOME && (
          <WelcomeStep onComplete={handleWelcomeComplete} refreshUser={refreshUser} />
        )}

        {currentStep === SETUP_STEP_CONTEXT_ANALYSIS && (
          <ContextAnalysisStep onComplete={handleContextAnalysisComplete} />
        )}

        {currentStep === SETUP_STEP_EMAIL_IMPORT && (
          <EmailImportStep onComplete={handleEmailImportComplete} isLoading={isLoading} />
        )}
      </div>
    </div>
  );
};
