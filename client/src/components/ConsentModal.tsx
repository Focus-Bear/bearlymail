import React, { useState } from 'react';
import axios from 'axios';
import { theme } from '../theme/theme';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

interface ConsentModalProps {
  needsTermsAcceptance: boolean;
  needsPrivacyAcceptance: boolean;
  onAccept: () => void;
}

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
      await axios.post(`${API_URL}/users/accept-consent`, {
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
    <div style={{
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
    }}>
      <div style={{
        backgroundColor: theme.colors.background.paper,
        borderRadius: theme.borderRadius.lg,
        padding: theme.spacing['2xl'],
        maxWidth: '600px',
        width: '100%',
        maxHeight: '90vh',
        overflowY: 'auto',
        boxShadow: theme.shadows.xl,
      }}>
        <h2 style={{
          fontSize: theme.typography.fontSize['2xl'],
          fontWeight: theme.typography.fontWeight.bold,
          marginBottom: theme.spacing.lg,
          color: theme.colors.text.primary,
        }}>
          Welcome to BearlyMail
        </h2>

        <p style={{
          marginBottom: theme.spacing.lg,
          color: theme.colors.text.secondary,
          lineHeight: theme.typography.lineHeight.relaxed,
        }}>
          To continue using BearlyMail, please review and accept our Terms of Use and Privacy Policy.
        </p>

        <div style={{ marginBottom: theme.spacing.lg }}>
          <label style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: theme.spacing.md,
            cursor: 'pointer',
            marginBottom: theme.spacing.md,
          }}>
            <input
              type="checkbox"
              checked={termsAccepted}
              onChange={(e) => setTermsAccepted(e.target.checked)}
              style={{
                marginTop: '4px',
                width: '20px',
                height: '20px',
                cursor: 'pointer',
              }}
              disabled={!needsTermsAcceptance}
            />
            <div style={{ flex: 1 }}>
              <span style={{ color: theme.colors.text.primary, fontWeight: theme.typography.fontWeight.medium }}>
                I accept the{' '}
                <a
                  href="/terms"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    color: theme.colors.primary.main,
                    textDecoration: 'underline',
                  }}
                >
                  Terms of Use
                </a>
                {needsTermsAcceptance && <span style={{ color: theme.colors.accent.error }}> *</span>}
              </span>
            </div>
          </label>

          <label style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: theme.spacing.md,
            cursor: 'pointer',
          }}>
            <input
              type="checkbox"
              checked={privacyAccepted}
              onChange={(e) => setPrivacyAccepted(e.target.checked)}
              style={{
                marginTop: '4px',
                width: '20px',
                height: '20px',
                cursor: 'pointer',
              }}
              disabled={!needsPrivacyAcceptance}
            />
            <div style={{ flex: 1 }}>
              <span style={{ color: theme.colors.text.primary, fontWeight: theme.typography.fontWeight.medium }}>
                I accept the{' '}
                <a
                  href="/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    color: theme.colors.primary.main,
                    textDecoration: 'underline',
                  }}
                >
                  Privacy Policy
                </a>
                {needsPrivacyAcceptance && <span style={{ color: theme.colors.accent.error }}> *</span>}
              </span>
            </div>
          </label>
        </div>

        <div style={{
          display: 'flex',
          gap: theme.spacing.md,
          justifyContent: 'flex-end',
        }}>
          <button
            onClick={handleAccept}
            disabled={!termsAccepted || !privacyAccepted || loading}
            style={{
              padding: `${theme.spacing.md} ${theme.spacing.xl}`,
              backgroundColor: (!termsAccepted || !privacyAccepted || loading)
                ? theme.colors.text.tertiary
                : theme.colors.primary.main,
              color: '#fff',
              border: 'none',
              borderRadius: theme.borderRadius.md,
              fontSize: theme.typography.fontSize.base,
              fontWeight: theme.typography.fontWeight.medium,
              cursor: (!termsAccepted || !privacyAccepted || loading) ? 'not-allowed' : 'pointer',
              transition: theme.transitions.default,
            }}
          >
            {loading ? 'Saving...' : 'Accept & Continue'}
          </button>
        </div>
      </div>
    </div>
  );
};


