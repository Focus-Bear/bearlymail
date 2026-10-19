import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';

import { API_URL } from 'config/api';
import { HTTP_UNAUTHORIZED } from 'constants/numbers';

const STEP_UP_TOKEN_HEADER = 'X-Step-Up-Token';

const isPasswordRequired = (error: unknown): boolean =>
  axios.isAxiosError(error) &&
  error.response?.status === HTTP_UNAUTHORIZED &&
  Boolean((error.response.data as { requiresPassword?: boolean } | undefined)?.requiresPassword);

const getSaveErrorMessage = (error: unknown, fallback: string): string =>
  axios.isAxiosError(error) && error.response?.data?.message ? error.response.data.message : fallback;

interface UsePasswordSaveOptions {
  password: string;
  confirmPassword: string;
  onSaved: () => void;
}

/**
 * Saves a new password through PUT /auth/set-password, which requires a step-up
 * token so a stolen session alone can't replace the password (issue #324).
 * OAuth-only users get a token straight away; users who already have a password
 * re-enter it in the step-up modal described by `stepUpModalProps`.
 */
export function usePasswordSave({ password, confirmPassword, onSaved }: UsePasswordSaveOptions) {
  const { t } = useTranslation();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isStepUpOpen, setIsStepUpOpen] = useState(false);
  const [stepUpError, setStepUpError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  const saveWithToken = async (stepUpToken: string) => {
    await axios.put(
      `${API_URL}/auth/set-password`,
      { password, confirmPassword },
      { headers: { [STEP_UP_TOKEN_HEADER]: stepUpToken } }
    );
    onSaved();
  };

  const save = async () => {
    setError(null);
    setIsSaving(true);
    try {
      const response = await axios.post(`${API_URL}/auth/step-up`, {});
      await saveWithToken(response.data.step_up_token);
    } catch (err: unknown) {
      if (isPasswordRequired(err)) {
        setStepUpError(null);
        setIsStepUpOpen(true);
      } else {
        setError(getSaveErrorMessage(err, t('settings.setPassword.error')));
      }
    } finally {
      setIsSaving(false);
    }
  };

  const confirmCurrentPassword = async (currentPassword: string) => {
    setIsVerifying(true);
    setStepUpError(null);
    let stepUpToken: string;
    try {
      // A wrong password is a plain 401; skip the interceptor so it doesn't log the user out.
      const response = await axios.post(
        `${API_URL}/auth/step-up`,
        { password: currentPassword },
        { _skipInterceptor: true }
      );
      stepUpToken = response.data.step_up_token;
    } catch (err: unknown) {
      const isWrongPassword = axios.isAxiosError(err) && err.response?.status === HTTP_UNAUTHORIZED;
      setStepUpError(isWrongPassword ? t('stepUp.invalidPassword') : t('settings.setPassword.error'));
      setIsVerifying(false);
      return;
    }
    try {
      await saveWithToken(stepUpToken);
    } catch (err: unknown) {
      setError(getSaveErrorMessage(err, t('settings.setPassword.error')));
    } finally {
      setIsVerifying(false);
      setIsStepUpOpen(false);
    }
  };

  const cancelStepUp = () => {
    setIsStepUpOpen(false);
    setStepUpError(null);
  };

  return {
    save,
    isSaving,
    error,
    setError,
    stepUpModalProps: {
      isOpen: isStepUpOpen,
      onConfirm: confirmCurrentPassword,
      onCancel: cancelStepUp,
      error: stepUpError,
      isLoading: isVerifying,
    },
  };
}
