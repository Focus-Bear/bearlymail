import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { WelcomeStep } from './WelcomeStep';
import { ContextAnalysisStep } from './ContextAnalysisStep';
import { EmailImportStep } from './EmailImportStep';
import axios from 'axios';
import { API_URL } from 'config/api';

interface SetupWizardProps {
  onComplete: () => void;
  refreshUser: () => Promise<void>;
}

type WizardStep = 'welcome' | 'context-analysis' | 'email-import';

export const SetupWizard: React.FC<SetupWizardProps> = ({ onComplete, refreshUser }) => {
  const { t } = useTranslation();
  const [currentStep, setCurrentStep] = useState<WizardStep>('welcome');
  const [isLoading, setIsLoading] = useState(false);

  const handleWelcomeComplete = useCallback(async () => {
    setCurrentStep('context-analysis');
  }, []);

  const handleContextAnalysisComplete = useCallback(async () => {
    setCurrentStep('email-import');
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
      case 'welcome':
        return 1;
      case 'context-analysis':
        return 2;
      case 'email-import':
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

        {currentStep === 'welcome' && (
          <WelcomeStep onComplete={handleWelcomeComplete} refreshUser={refreshUser} />
        )}

        {currentStep === 'context-analysis' && (
          <ContextAnalysisStep onComplete={handleContextAnalysisComplete} />
        )}

        {currentStep === 'email-import' && (
          <EmailImportStep onComplete={handleEmailImportComplete} isLoading={isLoading} />
        )}
      </div>
    </div>
  );
};
