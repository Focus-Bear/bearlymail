import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { theme } from 'theme/theme';

import { API_URL } from 'config/api';

interface WelcomeStepProps {
  onComplete: () => void;
  refreshUser: () => Promise<void>;
}

const OpenAiSection: React.FC<{
  openAiExpanded: boolean;
  toggle: () => void;
  openAiApiKey: string;
  setOpenAiApiKey: (v: string) => void;
  showApiKey: boolean;
  setShowApiKey: (v: boolean) => void;
  t: (tKey: string) => string;
}> = ({ openAiExpanded, toggle, openAiApiKey, setOpenAiApiKey, showApiKey, setShowApiKey, t }) => (
  <div
    style={{
      backgroundColor: theme.colors.background.paper,
      border: `1px solid ${theme.colors.border.light}`,
      borderRadius: theme.borderRadius.md,
      marginBottom: theme.spacing.lg,
      overflow: 'hidden',
    }}
  >
    <button
      type="button"
      onClick={toggle}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: theme.spacing.lg,
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      <h3
        style={{
          color: theme.colors.text.primary,
          fontSize: theme.typography.fontSize.lg,
          fontWeight: theme.typography.fontWeight.semibold,
          margin: 0,
        }}
      >
        {t('setupWizard.welcome.openAiTitle')}
      </h3>
      <span style={{ fontSize: theme.typography.fontSize.lg, color: theme.colors.text.secondary }}>{'\u25BC'}</span>
    </button>
    {openAiExpanded && (
      <div style={{ padding: `0 ${theme.spacing.lg} ${theme.spacing.lg}` }}>
        <p
          style={{
            color: theme.colors.text.secondary,
            fontSize: theme.typography.fontSize.sm,
            lineHeight: 1.6,
            marginBottom: theme.spacing.md,
          }}
        >
          {t('setupWizard.welcome.openAiDescription')}
        </p>
        <div style={{ position: 'relative' }}>
          <input
            type={showApiKey ? 'text' : 'password'}
            value={openAiApiKey}
            onChange={event => setOpenAiApiKey(event.target.value)}
            placeholder={t('setupWizard.welcome.openAiPlaceholder')}
            style={{
              width: '100%',
              padding: theme.spacing.md,
              paddingRight: '80px',
              border: `1px solid ${theme.colors.border.medium}`,
              borderRadius: theme.borderRadius.md,
              fontSize: theme.typography.fontSize.base,
              boxSizing: 'border-box',
            }}
          />
          <button
            type="button"
            onClick={() => setShowApiKey(!showApiKey)}
            style={{
              position: 'absolute',
              right: theme.spacing.sm,
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'none',
              border: 'none',
              color: theme.colors.primary.main,
              cursor: 'pointer',
              fontSize: theme.typography.fontSize.sm,
            }}
          >
            {showApiKey ? t('settings.hide') : t('settings.show')}
          </button>
        </div>
      </div>
    )}
  </div>
);

const ConsentField: React.FC<{
  consentAccepted: boolean;
  setConsentAccepted: (v: boolean) => void;
  t: (tKey: string) => string;
}> = ({ consentAccepted, setConsentAccepted, t }) => (
  <div style={{ marginBottom: theme.spacing.lg }}>
    <label style={{ display: 'flex', alignItems: 'flex-start', gap: theme.spacing.sm, cursor: 'pointer' }}>
      <input
        type="checkbox"
        checked={consentAccepted}
        onChange={event => setConsentAccepted(event.target.checked)}
        style={{
          width: '20px',
          height: '20px',
          marginTop: '2px',
          flexShrink: 0,
          accentColor: theme.colors.primary.main,
          cursor: 'pointer',
        }}
      />
      <span style={{ color: theme.colors.text.primary, fontSize: theme.typography.fontSize.sm, flex: 1 }}>
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

export const WelcomeStep: React.FC<WelcomeStepProps> = ({ onComplete, refreshUser }) => {
  const { t } = useTranslation();
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [openAiApiKey, setOpenAiApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [openAiExpanded, setOpenAiExpanded] = useState(false);

  const toggleOpenAiSection = useCallback(() => {
    setOpenAiExpanded(prev => !prev);
  }, []);

  const canContinue = consentAccepted;

  const handleContinue = async () => {
    if (!canContinue) {
      return;
    }

    setIsLoading(true);
    try {
      await axios.post(`${API_URL}/users/accept-consent`, { termsAccepted: true, privacyAccepted: true });

      if (openAiApiKey.trim()) {
        await axios.post(`${API_URL}/users/api-key`, { openAiApiKey: openAiApiKey.trim() });
      }

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
            fontSize: theme.typography.fontSize.lg,
            fontWeight: theme.typography.fontWeight.semibold,
            marginBottom: theme.spacing.sm,
          }}
        >
          {t('setupWizard.welcome.privacyTitle')}
        </h3>
        <p
          style={{
            color: theme.colors.text.secondary,
            fontSize: theme.typography.fontSize.sm,
            lineHeight: 1.6,
            margin: 0,
          }}
        >
          {t('setupWizard.welcome.privacyMessage')}
        </p>
      </div>

      <OpenAiSection
        openAiExpanded={openAiExpanded}
        toggle={toggleOpenAiSection}
        openAiApiKey={openAiApiKey}
        setOpenAiApiKey={setOpenAiApiKey}
        showApiKey={showApiKey}
        setShowApiKey={setShowApiKey}
        t={t}
      />

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
