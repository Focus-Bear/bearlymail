import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { getAxiosErrorMessage } from 'utils/errors';
import { isPasswordChallenge, isWrongPassword, requestStepUpToken, STEP_UP_TOKEN_HEADER } from 'utils/stepUpRequest';

import { API_URL } from 'config/api';
import { OAUTH_CONSENT_REQUESTS_ENDPOINT } from 'constants/claudeAccess';

import { OAuthConsentDecision, OAuthConsentRequest } from './types';

/**
 * Loads a pending OAuth request and submits the user's answer. On success the
 * browser is sent to the client's redirect URI, so `isRedirecting` stays true.
 * Approving needs a step-up token, so password users confirm their password
 * first; declining doesn't.
 */
export function useOAuthConsentRequest(requestId: string | null, enabled: boolean) {
  const [request, setRequest] = useState<OAuthConsentRequest | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [pendingDecision, setPendingDecision] = useState<OAuthConsentDecision | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const { t } = useTranslation();

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

  const submit = useCallback(
    async (decision: OAuthConsentDecision, stepUpToken?: string) => {
      const url = `${API_URL}${OAUTH_CONSENT_REQUESTS_ENDPOINT}/${encodeURIComponent(requestId ?? '')}/decision`;
      const response = await axios.post<{ redirectUrl: string }>(url, decision, {
        headers: stepUpToken ? { [STEP_UP_TOKEN_HEADER]: stepUpToken } : {},
      });
      setIsRedirecting(true);
      window.location.assign(response.data.redirectUrl);
    },
    [requestId]
  );

  const decide = useCallback(
    async (decision: OAuthConsentDecision) => {
      if (!requestId) {
        return;
      }
      setIsSubmitting(true);
      setSubmitError(null);
      try {
        await submit(decision, decision.approve ? await requestStepUpToken() : undefined);
      } catch (err: unknown) {
        if (isPasswordChallenge(err)) {
          setPasswordError(null);
          setPendingDecision(decision);
        } else {
          setSubmitError(getAxiosErrorMessage(err, ''));
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [requestId, submit]
  );

  const confirmPassword = async (password: string) => {
    if (!pendingDecision) {
      return;
    }
    setIsSubmitting(true);
    setPasswordError(null);
    try {
      await submit(pendingDecision, await requestStepUpToken(password));
      setPendingDecision(null);
    } catch (err: unknown) {
      if (isWrongPassword(err)) {
        setPasswordError(t('stepUp.invalidPassword'));
      } else {
        setPendingDecision(null);
        setSubmitError(getAxiosErrorMessage(err, ''));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const stepUpModalProps = {
    isOpen: pendingDecision !== null,
    onConfirm: confirmPassword,
    onCancel: () => setPendingDecision(null),
    error: passwordError,
    isLoading: isSubmitting,
  };

  return { request, loadError, submitError, isSubmitting, isRedirecting, decide, stepUpModalProps };
}
