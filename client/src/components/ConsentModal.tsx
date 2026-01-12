import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { OPACITY_DISABLED_ALT, VIEWPORT_HEIGHT_90, Z_INDEX_MODAL_OVERLAY } from 'constants/numbers';
import { ConsentModalHeader, ConsentCheckbox, ConsentModalFooter } from 'components/consent';
import { acceptConsent } from 'utils/consentApi';

interface ConsentModalProps {
  needsTermsAcceptance: boolean;
  needsPrivacyAcceptance: boolean;
  onAccept: () => void;
}

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
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleAccept = async () => {
    if (!termsAccepted || !privacyAccepted) {
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

        <div style={{ marginBottom: theme.spacing.lg }}>
          <ConsentCheckbox
            checked={termsAccepted}
            onChange={setTermsAccepted}
            disabled={!needsTermsAcceptance}
            label={t('consent.iAcceptThe')}
            linkText={t('consent.termsOfUse')}
            linkHref="/terms"
            required={needsTermsAcceptance}
          />

          <ConsentCheckbox
            checked={privacyAccepted}
            onChange={setPrivacyAccepted}
            disabled={!needsPrivacyAcceptance}
            label={t('consent.iAcceptThe')}
            linkText={t('consent.privacyPolicy')}
            linkHref="/privacy"
            required={needsPrivacyAcceptance}
          />
        </div>

        <ConsentModalFooter
          termsAccepted={termsAccepted}
          privacyAccepted={privacyAccepted}
          loading={loading}
          onAccept={handleAccept}
        />
      </div>
    </div>
  );
};


