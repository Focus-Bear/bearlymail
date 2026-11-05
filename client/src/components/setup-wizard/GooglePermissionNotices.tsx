import React from 'react';
import { useTranslation } from 'react-i18next';

import { startGoogleReconnect } from 'components/gmail-access/GmailAccessAlert';

import { GMAIL_PERMISSION_PROBLEM, GmailPermissionProblem } from './google-permissions';
import { ONBOARDING_TOKENS as TOK } from './onboarding-tokens';

const FONT_WEIGHT_SEMIBOLD = 600;
const FONT_WEIGHT_BOLD = 700;

const GMAIL_PROBLEM_BODY_KEYS: Record<GmailPermissionProblem, string> = {
  [GMAIL_PERMISSION_PROBLEM.UNTICKED]: 'setupWizard.welcome.permissions.gmailBody',
  [GMAIL_PERMISSION_PROBLEM.REVOKED]: 'setupWizard.welcome.permissions.gmailBodyRevoked',
};

/**
 * Takes the place of the "Your inbox is connected" card when BearlyMail can't
 * read the mailbox: everything after this screen depends on it.
 */
export const GmailPermissionWarning: React.FC<{ problem: GmailPermissionProblem }> = ({ problem }) => {
  const { t } = useTranslation();
  return (
    <div role="alert" data-testid="onboarding-gmail-permission-warning" style={gmailCardStyle}>
      <div style={iconWrapStyle(TOK.red)}>
        <WarningIcon />
      </div>
      <div>
        <h3 style={titleStyle(TOK.red)}>{t('setupWizard.welcome.permissions.gmailTitle')}</h3>
        <p style={bodyStyle}>{t(GMAIL_PROBLEM_BODY_KEYS[problem])}</p>
        <button type="button" onClick={startGoogleReconnect} style={buttonStyle(TOK.red)}>
          {t('setupWizard.welcome.permissions.gmailButton')}
        </button>
      </div>
    </div>
  );
};

const WarningIcon: React.FC = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    width="20"
    height="20"
  >
    <path d="M12 3l9.5 17h-19z" />
    <path d="M12 10v4M12 17.5v.01" />
  </svg>
);

const cardBaseStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '40px 1fr',
  gap: '14px',
  padding: '16px',
  borderRadius: '12px',
  alignItems: 'start',
};

const gmailCardStyle: React.CSSProperties = {
  ...cardBaseStyle,
  background: TOK.redPale,
  border: `1.5px solid ${TOK.redLine}`,
  borderLeft: `4px solid ${TOK.red}`,
};

const iconWrapStyle = (color: string): React.CSSProperties => ({
  width: '40px',
  height: '40px',
  borderRadius: '10px',
  background: '#fff',
  border: `1px solid ${TOK.line2}`,
  display: 'grid',
  placeItems: 'center',
  color,
});

const titleStyle = (color: string): React.CSSProperties => ({
  margin: '2px 0 4px',
  fontSize: '15px',
  fontWeight: FONT_WEIGHT_BOLD,
  color,
});

const bodyStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '13.5px',
  color: TOK.ink2,
  lineHeight: 1.5,
};

const buttonStyle = (color: string): React.CSSProperties => ({
  marginTop: '12px',
  height: '38px',
  padding: '0 16px',
  borderRadius: '10px',
  border: 'none',
  background: color,
  color: '#fff',
  fontSize: '14px',
  fontWeight: FONT_WEIGHT_SEMIBOLD,
  cursor: 'pointer',
});
