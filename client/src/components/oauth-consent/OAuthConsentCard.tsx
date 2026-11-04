import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { ConsentScopeChoice } from './ConsentScopeChoice';
import { OAuthConsentDecision, OAuthConsentRequest } from './types';

interface OAuthConsentCardProps {
  request: OAuthConsentRequest;
  userEmail: string;
  isSubmitting: boolean;
  submitError: string | null;
  onDecide: (decision: OAuthConsentDecision) => void;
}

const buttonStyle: React.CSSProperties = {
  flex: 1,
  padding: `${theme.spacing.sm} ${theme.spacing.md}`,
  borderRadius: theme.borderRadius.md,
  fontSize: theme.typography.fontSize.md,
  fontWeight: theme.typography.fontWeight.semibold,
  cursor: 'pointer',
};

const detailStyle: React.CSSProperties = {
  margin: `0 0 ${theme.spacing.xs}`,
  fontSize: theme.typography.fontSize.sm,
  color: theme.colors.text.secondary,
};

/**
 * Asks the logged-in user whether an app (claude.ai, Claude Code…) may use
 * their mailbox. The redirect host is shown prominently because the app's
 * name is self-asserted: where the code goes is what the user can verify.
 */
export const OAuthConsentCard: React.FC<OAuthConsentCardProps> = ({
  request,
  userEmail,
  isSubmitting,
  submitError,
  onDecide,
}) => {
  const { t } = useTranslation();
  const [allowSend, setAllowSend] = useState(false);

  return (
    <div data-testid="oauth-consent">
      <h1
        style={{
          margin: `0 0 ${theme.spacing.md}`,
          fontSize: theme.typography.fontSize.xl,
          fontWeight: theme.typography.fontWeight.semibold,
          color: theme.colors.text.primary,
        }}
      >
        {t('oauthConsent.title', { client: request.clientName })}
      </h1>
      <p style={detailStyle}>
        {request.clientHost
          ? t('oauthConsent.verifiedClient', { host: request.clientHost })
          : t('oauthConsent.selfDescribedClient')}
      </p>
      <p style={detailStyle} data-testid="oauth-consent-redirect-host">
        {t('oauthConsent.redirectTo')} <strong style={{ color: theme.colors.text.primary }}>{request.redirectHost}</strong>
      </p>
      <p style={{ ...detailStyle, marginBottom: theme.spacing.lg }}>
        {t('oauthConsent.signedInAs', { email: userEmail })}
      </p>

      {request.isLoopbackRedirect && (
        <p
          role="note"
          data-testid="oauth-consent-loopback-warning"
          style={{
            margin: `0 0 ${theme.spacing.lg}`,
            padding: theme.spacing.sm,
            borderRadius: theme.borderRadius.md,
            backgroundColor: theme.colors.warning.light,
            fontSize: theme.typography.fontSize.sm,
            color: theme.colors.text.primary,
          }}
        >
          {t('oauthConsent.loopbackWarning')}
        </p>
      )}

      <ConsentScopeChoice allowSend={allowSend} canRequestSend={request.canRequestSend} onChange={setAllowSend} />

      <p style={{ ...detailStyle, marginBottom: theme.spacing.lg, fontSize: theme.typography.fontSize.xs }}>
        {t('oauthConsent.safetyNote')}
      </p>

      {submitError !== null && (
        <p role="alert" style={{ ...detailStyle, color: theme.colors.error.dark }}>
          {submitError || t('oauthConsent.submitError')}
        </p>
      )}

      <div style={{ display: 'flex', gap: theme.spacing.sm, flexWrap: 'wrap' }}>
        <button
          type="button"
          disabled={isSubmitting}
          onClick={() => onDecide({ approve: false, allowSend: false })}
          data-testid="oauth-consent-deny"
          style={{
            ...buttonStyle,
            border: `1px solid ${theme.colors.border.light}`,
            backgroundColor: theme.colors.background.paper,
            color: theme.colors.text.primary,
          }}
        >
          {t('oauthConsent.deny')}
        </button>
        <button
          type="button"
          disabled={isSubmitting}
          onClick={() => onDecide({ approve: true, allowSend })}
          data-testid="oauth-consent-allow"
          style={{
            ...buttonStyle,
            border: 'none',
            backgroundColor: theme.colors.primary.main,
            color: theme.colors.text.primary,
          }}
        >
          {isSubmitting ? t('oauthConsent.allowing') : t('oauthConsent.allow')}
        </button>
      </div>
    </div>
  );
};
