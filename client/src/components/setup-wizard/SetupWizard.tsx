import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

import { API_URL } from 'config/api';
import { SETUP_STEP_LEARNING, SETUP_STEP_SCHEDULE, SETUP_STEP_WELCOME } from 'constants/strings';
import { useAuth } from 'contexts/AuthContext';

import { LearningStep } from './LearningStep';
import { ONBOARDING_TOKENS as TOK } from './onboarding-tokens';
import { ScheduleStep } from './ScheduleStep';
import { WelcomeStep } from './WelcomeStep';

interface SetupWizardProps {
  onComplete: () => void;
  refreshUser: () => Promise<void>;
}

type WizardStep = typeof SETUP_STEP_WELCOME | typeof SETUP_STEP_SCHEDULE | typeof SETUP_STEP_LEARNING;

const STEP_ORDER: WizardStep[] = [SETUP_STEP_WELCOME, SETUP_STEP_SCHEDULE, SETUP_STEP_LEARNING];

export const SetupWizard: React.FC<SetupWizardProps> = ({ onComplete, refreshUser }) => {
  const { t } = useTranslation();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState<WizardStep>(SETUP_STEP_WELCOME);
  const [isLoading, setIsLoading] = useState(false);

  const handleSignOut = useCallback(() => {
    logout();
    navigate('/login');
  }, [logout, navigate]);

  const goToStep = useCallback((step: WizardStep) => {
    setCurrentStep(step);
  }, []);

  const handleWelcomeComplete = useCallback(() => goToStep(SETUP_STEP_SCHEDULE), [goToStep]);
  const handleScheduleComplete = useCallback(() => goToStep(SETUP_STEP_LEARNING), [goToStep]);
  const handleScheduleBack = useCallback(() => goToStep(SETUP_STEP_WELCOME), [goToStep]);
  const handleLearningBack = useCallback(() => goToStep(SETUP_STEP_SCHEDULE), [goToStep]);

  const handleLearningComplete = useCallback(async () => {
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

  const stepIndex = STEP_ORDER.indexOf(currentStep) + 1;

  const steps: Array<{ key: WizardStep; label: string }> = [
    { key: SETUP_STEP_WELCOME, label: t('setupWizard.stepper.welcome') },
    { key: SETUP_STEP_SCHEDULE, label: t('setupWizard.stepper.schedule') },
    { key: SETUP_STEP_LEARNING, label: t('setupWizard.stepper.learning') },
  ];

  return (
    <div style={overlayStyle}>
      <SetupWizardStyles />
      <header style={topBarStyle}>
        <div style={brandStyle}>
          <img src="/favicon.svg" alt="" aria-hidden="true" style={brandLogoStyle} />
          {/* eslint-disable-next-line i18next/no-literal-string */}
          <span>BearlyMail</span>
        </div>
        <div style={topMetaStyle}>
          <a href="https://focusbear.io" target="_blank" rel="noopener noreferrer" style={topMetaLinkStyle}>
            {t('setupWizard.top.help')}
          </a>
          <button type="button" onClick={handleSignOut} style={topMetaButtonStyle}>
            {t('setupWizard.top.signOut')}
          </button>
        </div>
      </header>

      <main style={stageStyle}>
        <div style={cardStyle} className="onboarding-card">
          <Stepper steps={steps} currentIndex={stepIndex} />

          {currentStep === SETUP_STEP_WELCOME && (
            <WelcomeStep onComplete={handleWelcomeComplete} refreshUser={refreshUser} />
          )}
          {currentStep === SETUP_STEP_SCHEDULE && (
            <ScheduleStep onComplete={handleScheduleComplete} onBack={handleScheduleBack} />
          )}
          {currentStep === SETUP_STEP_LEARNING && (
            <LearningStep onComplete={handleLearningComplete} onBack={handleLearningBack} isLoading={isLoading} />
          )}
        </div>
      </main>

      <footer style={bottomStyle}>
        <a href="/privacy" style={bottomLinkStyle}>
          {t('setupWizard.footer.privacy')}
        </a>
        <a href="/terms" style={bottomLinkStyle}>
          {t('setupWizard.footer.terms')}
        </a>
        <span>{t('setupWizard.footer.copyright')}</span>
      </footer>
    </div>
  );
};

interface StepperProps {
  steps: Array<{ key: string; label: string }>;
  currentIndex: number;
}

const Stepper: React.FC<StepperProps> = ({ steps, currentIndex }) => (
  <div style={stepperStyle}>
    {steps.map((step, idx) => {
      const i = idx + 1;
      const isActive = i === currentIndex;
      const isDone = i < currentIndex;
      return (
        <React.Fragment key={step.key}>
          <div
            className={`step-dot${isActive ? ' active' : ''}${isDone ? ' done' : ''}`}
            style={stepDotStyle}
          >
            <span
              className={`step-num${isActive ? ' active' : ''}${isDone ? ' done' : ''}`}
              style={stepNumBaseStyle(isActive, isDone)}
            >
              {isDone ? '✓' : i}
            </span>
            <span className="step-label" style={stepLabelStyle(isActive, isDone)}>
              {step.label}
            </span>
          </div>
          {idx < steps.length - 1 && (
            <div className="step-sep" style={stepSepStyle(isDone)} />
          )}
        </React.Fragment>
      );
    })}
  </div>
);


const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: TOK.cream,
  color: TOK.ink,
  fontFamily: TOK.fontSans,
  display: 'flex',
  flexDirection: 'column',
  overflowY: 'auto',
  zIndex: 9999,
  WebkitFontSmoothing: 'antialiased',
};

const topBarStyle: React.CSSProperties = {
  padding: '22px 32px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
};

const brandStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  fontWeight: 700,
  letterSpacing: '-0.01em',
  fontSize: '17px',
};

const brandLogoStyle: React.CSSProperties = {
  height: '28px',
  width: 'auto',
  objectFit: 'contain',
};

const topMetaStyle: React.CSSProperties = {
  fontSize: '13px',
  color: TOK.ink3,
  display: 'inline-flex',
  alignItems: 'center',
  gap: '16px',
};

const topMetaLinkStyle: React.CSSProperties = {
  color: TOK.ink3,
  textDecoration: 'none',
};

const topMetaButtonStyle: React.CSSProperties = {
  ...topMetaLinkStyle,
  background: 'none',
  border: 'none',
  padding: 0,
  font: 'inherit',
  cursor: 'pointer',
};

const stageStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '24px',
};

const cardStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: '720px',
  background: '#fff',
  border: `1px solid ${TOK.line2}`,
  borderRadius: '24px',
  boxShadow: TOK.shadowCard,
  padding: '48px 56px 40px',
  position: 'relative',
  overflow: 'hidden',
};

const stepperStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  justifyContent: 'center',
  marginBottom: '36px',
};

const stepDotStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
};

const stepNumBaseStyle = (active: boolean, done: boolean): React.CSSProperties => ({
  width: '28px',
  height: '28px',
  borderRadius: '999px',
  display: 'grid',
  placeItems: 'center',
  background: active || done ? TOK.sun : TOK.cream2,
  color: active || done ? '#fff' : TOK.ink3,
  fontSize: done ? '13px' : '12px',
  fontWeight: 600,
  border: `1px solid ${active || done ? TOK.sun : TOK.line}`,
  transition: 'background .2s ease, color .2s ease, border-color .2s ease, transform .2s ease',
  transform: active ? 'scale(1.08)' : 'none',
  boxShadow: active ? `0 0 0 4px ${TOK.sunPale}` : 'none',
});

function pickStepLabelColor(active: boolean, done: boolean): string {
  if (done) {
    return TOK.sunDark;
  }
  if (active) {
    return TOK.ink;
  }
  return TOK.ink3;
}

const stepLabelStyle = (active: boolean, done: boolean): React.CSSProperties => ({
  fontSize: '12px',
  fontWeight: 600,
  color: pickStepLabelColor(active, done),
  letterSpacing: '0.01em',
});

const stepSepStyle = (done: boolean): React.CSSProperties => ({
  width: '32px',
  height: '1px',
  background: done ? TOK.sun : TOK.line2,
  margin: '0 -2px',
});

const bottomStyle: React.CSSProperties = {
  padding: '24px 32px',
  fontSize: '12px',
  color: TOK.ink4,
  display: 'flex',
  justifyContent: 'center',
  gap: '24px',
};

const bottomLinkStyle: React.CSSProperties = {
  color: TOK.ink3,
  textDecoration: 'none',
};

const SetupWizardStyles: React.FC = () => (
  <style>{`
    @keyframes onboardingSpin { to { transform: rotate(360deg); } }
    @keyframes onboardingPaneIn {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: none; }
    }
    .onboarding-pane { animation: onboardingPaneIn .35s ease both; }
    .onboarding-card a { color: ${TOK.sunDark}; }
    .onboarding-card button { font-family: inherit; cursor: pointer; }
    @media (max-width: 640px) {
      .onboarding-card { padding: 28px 22px !important; border-radius: 18px !important; }
      .onboarding-step-label { display: none !important; }
      .onboarding-step-sep { width: 18px !important; }
      .onboarding-h1 { font-size: 26px !important; }
      .onboarding-lede { font-size: 15px !important; margin-bottom: 22px !important; }
      .onboarding-freq-grid { grid-template-columns: 1fr 1fr 1fr !important; }
      .onboarding-prop { grid-template-columns: 36px 1fr !important; }
      .onboarding-prop .done-tag { grid-column: 1 / -1 !important; justify-self: start !important; margin-top: 4px !important; }
    }
  `}</style>
);
