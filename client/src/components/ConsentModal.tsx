import React, { useState } from 'react';
import { theme } from '../theme/theme';
import { ConsentModalHeader, ConsentCheckbox, ConsentModalFooter } from './consent';
import { acceptConsent } from '../utils/consentApi';

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
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleAccept = async () => {
    if (!termsAccepted || !privacyAccepted) {
      alert('Please accept both the Terms of Use and Privacy Policy to continue.');
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
      alert('Failed to save your consent. Please try again.');
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
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
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
          maxHeight: '90vh',
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
            label="I accept the"
            linkText="Terms of Use"
            linkHref="/terms"
            required={needsTermsAcceptance}
          />

          <ConsentCheckbox
            checked={privacyAccepted}
            onChange={setPrivacyAccepted}
            disabled={!needsPrivacyAcceptance}
            label="I accept the"
            linkText="Privacy Policy"
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


