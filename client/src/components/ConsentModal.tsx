import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { acceptConsent } from 'utils/consentApi';

import { ConsentModalFooter, ConsentModalHeader } from 'components/consent';
import { OPACITY_DISABLED_ALT, VIEWPORT_HEIGHT_90, Z_INDEX_MODAL_OVERLAY } from 'constants/numbers';

interface ConsentModalProps {
  needsTermsAcceptance: boolean;
  needsPrivacyAcceptance: boolean;
  onAccept: () => void;
}

const linkStyle = { color: theme.colors.primary.main, textDecoration: 'underline' } as const;

const ConsentCheckbox: React.FC<{ checked: boolean; onChange: (v: boolean) => void }> = ({ checked, onChange }) => {
  const { t } = useTranslation();
  return (
    <div style={{ marginBottom: theme.spacing.lg }}>
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: theme.spacing.md, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={checked}
          onChange={event => onChange(event.target.checked)}
          style={{ marginTop: '4px', width: '20px', height: '20px', flexShrink: 0, cursor: 'pointer' }}
        />
        <div style={{ flex: 1 }}>
          <span style={{ color: theme.colors.text.primary, fontWeight: theme.typography.fontWeight.medium }}>
            {t('consent.iAcceptThe')}{' '}
            <a
              href="/terms"
              target="_blank"
              rel="noopener noreferrer"
              onClick={event => event.stopPropagation()}
              style={linkStyle}
            >
              {t('consent.termsOfUse')}
            </a>{' '}
            {t('consent.and')}{' '}
            <a
              href="/privacy"
              target="_blank"
              rel="noopener noreferrer"
              onClick={event => event.stopPropagation()}
              style={linkStyle}
            >
              {t('consent.privacyPolicy')}
            </a>
            <span style={{ color: theme.colors.accent.error }}> *</span>
          </span>
        </div>
      </label>
    </div>
  );
};

/**
 * Consent modal component
 * Handles user consent for terms and privacy policy
 */
export const ConsentModal: React.FC<ConsentModalProps> = ({
  needsTermsAcceptance,
  needsPrivacyAcceptance,
  onAccept,
}) => {
  const { t } = useTranslation();
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleAccept = async () => {
    if (!consentAccepted) {
      alert(t('consent.pleaseAcceptBoth'));
      return;
    }

    setLoading(true);
    try {
      await acceptConsent({
        termsAccepted: needsTermsAcceptance,
        privacyAccepted: needsPrivacyAcceptance,
      });
      onAccept();
    } catch (error) {
      console.error('Failed to accept consent:', error);
      alert(t('consent.saveError'));
    } finally {
      setLoading(false);
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
        backgroundColor: `rgba(0, 0, 0, ${OPACITY_DISABLED_ALT})`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: Z_INDEX_MODAL_OVERLAY,
        padding: theme.spacing.lg,
      }}
    >
      <div
        style={{
          backgroundColor: theme.colors.background.paper,
          borderRadius: theme.borderRadius.lg,
          padding: theme.spacing['2xl'],
          maxWidth: '600px',
          width: '100%',
          maxHeight: VIEWPORT_HEIGHT_90,
          overflowY: 'auto',
          boxShadow: theme.shadows.xl,
        }}
      >
        <ConsentModalHeader />

        <ConsentCheckbox checked={consentAccepted} onChange={setConsentAccepted} />

        <ConsentModalFooter
          termsAccepted={consentAccepted}
          privacyAccepted={consentAccepted}
          loading={loading}
          onAccept={handleAccept}
        />
      </div>
    </div>
  );
};
