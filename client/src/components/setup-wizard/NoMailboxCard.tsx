import React from 'react';
import { useTranslation } from 'react-i18next';

import { ConnectMailboxButton } from 'components/connect-mailbox/ConnectMailboxButton';

import { ONBOARDING_TOKENS as TOK } from './onboarding-tokens';

const FONT_WEIGHT_SEMIBOLD = 600;
const FONT_WEIGHT_BOLD = 700;

/**
 * Takes the place of the "Your inbox is connected" card when the user has no
 * email account yet (e.g. signed up with a password), and offers to connect one.
 */
export const NoMailboxCard: React.FC<{ onConnected: () => void }> = ({ onConnected }) => {
  const { t } = useTranslation();
  return (
    <div data-testid="onboarding-no-mailbox" style={cardStyle}>
      <div style={iconWrapStyle}>
        <MailIcon />
      </div>
      <div>
        <h3 style={titleStyle}>{t('setupWizard.welcome.noMailboxTitle')}</h3>
        <p style={bodyStyle}>{t('setupWizard.welcome.noMailboxBody')}</p>
        <ConnectMailboxButton style={buttonStyle} onConnected={onConnected} />
      </div>
    </div>
  );
};

const MailIcon: React.FC = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    width="20"
    height="20"
  >
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3 7l9 6 9-6" />
  </svg>
);

const cardStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '40px 1fr',
  gap: '14px',
  padding: '16px',
  borderRadius: '12px',
  alignItems: 'start',
  background: TOK.sunPale,
  border: `1.5px solid ${TOK.sunPale2}`,
  borderLeft: `4px solid ${TOK.sun}`,
};

const iconWrapStyle: React.CSSProperties = {
  width: '40px',
  height: '40px',
  borderRadius: '10px',
  background: '#fff',
  border: `1px solid ${TOK.line2}`,
  display: 'grid',
  placeItems: 'center',
  color: TOK.sunDark,
};

const titleStyle: React.CSSProperties = {
  margin: '2px 0 4px',
  fontSize: '15px',
  fontWeight: FONT_WEIGHT_BOLD,
  color: TOK.ink,
};

const bodyStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '13.5px',
  color: TOK.ink2,
  lineHeight: 1.5,
};

const buttonStyle: React.CSSProperties = {
  marginTop: '12px',
  height: '38px',
  padding: '0 16px',
  borderRadius: '10px',
  border: 'none',
  // Ink, not amber: white on the amber tokens is under the WCAG AA 4.5:1 contrast.
  background: TOK.ink,
  color: '#fff',
  fontSize: '14px',
  fontWeight: FONT_WEIGHT_SEMIBOLD,
  cursor: 'pointer',
};
