import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { getAxiosErrorMessage } from 'utils/errors';

import { API_URL } from 'config/api';
import { OAUTH_CONSENT_REQUESTS_ENDPOINT } from 'constants/claudeAccess';

import { OAuthConsentDecision, OAuthConsentRequest } from './types';

/**
 * Loads a pending OAuth request and submits the user's answer. On success the
 * browser is sent to the client's redirect URI, so `isRedirecting` stays true.
 */
export function useOAuthConsentRequest(requestId: string | null, enabled: boolean) {
  const [request, setRequest] = useState<OAuthConsentRequest | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);

  useEffect(() => {
    if (!enabled || !requestId) {
      return;
    }
    let isCancelled = false;
    axios
      .get<OAuthConsentRequest>(`${API_URL}${OAUTH_CONSENT_REQUESTS_ENDPOINT}/${encodeURIComponent(requestId)}`)
      .then(response => {
        if (!isCancelled) {
          setRequest(response.data);
        }
      })
      .catch((err: unknown) => {
        if (!isCancelled) {
          setLoadError(getAxiosErrorMessage(err, ''));
        }
      });
    return () => {
      isCancelled = true;
    };
  }, [requestId, enabled]);

  const decide = useCallback(
    async (decision: OAuthConsentDecision) => {
      if (!requestId) {
        return;
      }
      setIsSubmitting(true);
      setSubmitError(null);
      try {
        const response = await axios.post<{ redirectUrl: string }>(
          `${API_URL}${OAUTH_CONSENT_REQUESTS_ENDPOINT}/${encodeURIComponent(requestId)}/decision`,
          decision
        );
        setIsRedirecting(true);
        window.location.assign(response.data.redirectUrl);
      } catch (err: unknown) {
        setSubmitError(getAxiosErrorMessage(err, ''));
      } finally {
        setIsSubmitting(false);
      }
    },
    [requestId]
  );

  return { request, loadError, submitError, isSubmitting, isRedirecting, decide };
}
