import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { theme } from 'theme/theme';
import { clearPostLoginPath, rememberPostLoginPath } from 'utils/postLoginRedirect';

import { ConsentPageShell } from 'components/oauth-consent/ConsentPageShell';
import { OAuthConsentCard } from 'components/oauth-consent/OAuthConsentCard';
import { useOAuthConsentRequest } from 'components/oauth-consent/useOAuthConsentRequest';
import { OAUTH_CONSENT_REQUEST_PARAM } from 'constants/claudeAccess';
import { useAuth } from 'contexts/AuthContext';

const LOGIN_PATH = '/login';

const StatusMessage: React.FC<{ text: string; isError?: boolean }> = ({ text, isError }) => (
  <p
    role={isError ? 'alert' : 'status'}
    style={{
      margin: 0,
      fontSize: theme.typography.fontSize.md,
      color: isError ? theme.colors.error.dark : theme.colors.text.secondary,
    }}
  >
    {text}
  </p>
);

/** Clickjacking guard: an approve button inside someone else's frame could be tricked into a click. */
function isFramed(): boolean {
  try {
    return window.top !== window.self;
  } catch {
    return true;
  }
}

/**
 * `/oauth/consent?request=…` — where BearlyMail's `/oauth/authorize` sends the
 * browser when Claude asks to connect. Signs the user in first if needed
 * (and brings them back here), then asks read-only or read + send.
 */
const OAuthConsent: React.FC = () => {
  const { t } = useTranslation();
  const { user, loading } = useAuth();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const requestId = searchParams.get(OAUTH_CONSENT_REQUEST_PARAM);
  const isEmbedded = isFramed();
  const { request, loadError, submitError, isSubmitting, isRedirecting, decide } = useOAuthConsentRequest(
    requestId,
    !!user && !isEmbedded
  );

  useEffect(() => {
    if (user) {
      clearPostLoginPath();
    }
  }, [user]);

  if (loading) {
    return (
      <ConsentPageShell>
        <StatusMessage text={t('oauthConsent.loading')} />
      </ConsentPageShell>
    );
  }
  if (!user) {
    rememberPostLoginPath(`${location.pathname}${location.search}`);
    return <Navigate to={LOGIN_PATH} replace />;
  }

  return <ConsentPageShell>{renderBody()}</ConsentPageShell>;

  function renderBody(): React.ReactNode {
    if (isEmbedded) {
      return <StatusMessage text={t('oauthConsent.framed')} isError />;
    }
    if (!requestId) {
      return <StatusMessage text={t('oauthConsent.invalidLink')} isError />;
    }
    if (loadError !== null) {
      return <StatusMessage text={t('oauthConsent.expired')} isError />;
    }
    if (!request) {
      return <StatusMessage text={t('oauthConsent.loading')} />;
    }
    if (isRedirecting) {
      return <StatusMessage text={t('oauthConsent.redirecting', { client: request.clientName })} />;
    }
    return (
      <OAuthConsentCard
        request={request}
        userEmail={user?.email ?? ''}
        isSubmitting={isSubmitting}
        submitError={submitError}
        onDecide={decide}
      />
    );
  }
};

export default OAuthConsent;
