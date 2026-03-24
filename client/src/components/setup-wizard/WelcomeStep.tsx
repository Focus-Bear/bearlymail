import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { theme } from 'theme/theme';

import { API_URL } from 'config/api';

interface WelcomeStepProps {
  onComplete: () => void;
  refreshUser: () => Promise<void>;
}

const ConsentField: React.FC<{
  consentAccepted: boolean;
  setConsentAccepted: (v: boolean) => void;
  t: (tKey: string) => string;
}> = ({ consentAccepted, setConsentAccepted, t }) => (
  <div style={{ marginBottom: theme.spacing.lg }}>
    <label style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm, cursor: 'pointer' }}>
      <input
        type="checkbox"
        checked={consentAccepted}
        onChange={event => setConsentAccepted(event.target.checked)}
        style={{
          width: '20px',
          height: '20px',
          flexShrink: 0,
          accentColor: theme.colors.primary.main,
          cursor: 'pointer',
        }}
      />
      <span style={{ color: theme.colors.text.primary, fontSize: theme.typography.fontSize.base, flex: 1 }}>
        {t('consent.iAcceptThe')}{' '}
        <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: theme.colors.primary.main }}>
          {t('consent.termsOfUse')}
        </a>{' '}
        {t('consent.and')}{' '}
        <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: theme.colors.primary.main }}>
          {t('consent.privacyPolicy')}
        </a>
      </span>
    </label>
  </div>
);

const WelcomeHeader: React.FC<{ t: (key: string) => string }> = ({ t }) => (
  <>
    <h2
      style={{
        color: theme.colors.text.primary,
        fontSize: theme.typography.fontSize['2xl'],
        fontWeight: theme.typography.fontWeight.bold,
        marginBottom: theme.spacing.md,
        textAlign: 'center',
      }}
    >
      {t('setupWizard.welcome.title')}
    </h2>

    <p
      style={{
        color: theme.colors.text.secondary,
        fontSize: theme.typography.fontSize.base,
        lineHeight: 1.6,
        marginBottom: theme.spacing.lg,
        textAlign: 'center',
      }}
    >
      {t('setupWizard.welcome.description')}
    </p>
  </>
);

const WelcomePrivacyBlock: React.FC<{ t: (key: string) => string }> = ({ t }) => (
  <div
    style={{
      backgroundColor: theme.colors.background.subtle,
      borderRadius: theme.borderRadius.md,
      padding: theme.spacing.lg,
      marginBottom: theme.spacing.lg,
    }}
  >
    <h3
      style={{
        color: theme.colors.text.primary,
        fontSize: theme.typography.fontSize.xl,
        fontWeight: theme.typography.fontWeight.semibold,
        marginBottom: theme.spacing.sm,
      }}
    >
      {t('setupWizard.welcome.privacyTitle')}
    </h3>
    <p
      style={{
        color: theme.colors.text.secondary,
        fontSize: theme.typography.fontSize.xl,
        lineHeight: 1.6,
        margin: 0,
      }}
    >
      {t('setupWizard.welcome.privacyMessage')}
    </p>
  </div>
);

// Note (#1430): The "Use Your Own OpenAI Key (Optional)" field is NOT present in this component.
// OpenAI API key configuration lives in Settings > Integrations (OpenAIApiKeySection) only.
export const WelcomeStep: React.FC<WelcomeStepProps> = ({ onComplete, refreshUser }) => {
  const { t } = useTranslation();
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const canContinue = consentAccepted;

  const handleContinue = async () => {
    if (!canContinue) {
      return;
    }

    setIsLoading(true);
    try {
      await axios.post(`${API_URL}/users/accept-consent`, { termsAccepted: true, privacyAccepted: true });

      await refreshUser();
      onComplete();
    } catch (error) {
      console.error('Failed to save settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div>
      <WelcomeHeader t={t} />
      <WelcomePrivacyBlock t={t} />

      <ConsentField consentAccepted={consentAccepted} setConsentAccepted={setConsentAccepted} t={t} />

      <button
        onClick={handleContinue}
        disabled={!canContinue || isLoading}
        style={{
          width: '100%',
          padding: theme.spacing.lg,
          backgroundColor: canContinue ? theme.colors.primary.main : theme.colors.border.light,
          color: canContinue ? 'white' : theme.colors.text.disabled,
          border: 'none',
          borderRadius: theme.borderRadius.md,
          fontSize: theme.typography.fontSize.base,
          fontWeight: theme.typography.fontWeight.semibold,
          cursor: canContinue ? 'pointer' : 'not-allowed',
          transition: theme.transitions.default,
        }}
      >
        {isLoading ? t('common.loading') : t('setupWizard.welcome.continue')}
      </button>
    </div>
  );
};
