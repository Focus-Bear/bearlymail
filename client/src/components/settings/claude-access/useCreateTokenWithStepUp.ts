import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';

import { API_URL } from 'config/api';
import { HTTP_UNAUTHORIZED } from 'constants/numbers';

import { CreatedPersonalAccessToken, CreatePersonalAccessTokenInput } from './types';

const STEP_UP_URL = `${API_URL}/auth/step-up`;

type CreateToken = (input: CreatePersonalAccessTokenInput, stepUpToken: string) => Promise<CreatedPersonalAccessToken>;

interface UseCreateTokenWithStepUpParams {
  createToken: CreateToken;
  onCreated: (created: CreatedPersonalAccessToken) => void;
  onError: (error: unknown) => void;
}

async function requestStepUpToken(password?: string): Promise<string> {
  const response = await axios.post<{ step_up_token: string }>(STEP_UP_URL, password ? { password } : {});
  return response.data.step_up_token;
}

function isPasswordChallenge(error: unknown): boolean {
  return (
    axios.isAxiosError(error) &&
    error.response?.status === HTTP_UNAUTHORIZED &&
    Boolean((error.response.data as { requiresPassword?: boolean } | undefined)?.requiresPassword)
  );
}

function isWrongPassword(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === HTTP_UNAUTHORIZED;
}

/**
 * Creating a token needs a step-up token. OAuth-only users get one straight
 * away; password users confirm their password in the modal first.
 */
export function useCreateTokenWithStepUp({ createToken, onCreated, onError }: UseCreateTokenWithStepUpParams) {
  const { t } = useTranslation();
  const [isCreating, setIsCreating] = useState(false);
  const [pendingInput, setPendingInput] = useState<CreatePersonalAccessTokenInput | null>(null);
  const [stepUpError, setStepUpError] = useState<string | null>(null);

  const handleCreate = async (input: CreatePersonalAccessTokenInput) => {
    setIsCreating(true);
    try {
      onCreated(await createToken(input, await requestStepUpToken()));
    } catch (error: unknown) {
      if (isPasswordChallenge(error)) {
        setStepUpError(null);
        setPendingInput(input);
      } else {
        onError(error);
      }
    } finally {
      setIsCreating(false);
    }
  };

  const handleConfirm = async (password: string) => {
    if (!pendingInput) {
      return;
    }
    setIsCreating(true);
    setStepUpError(null);
    try {
      onCreated(await createToken(pendingInput, await requestStepUpToken(password)));
      setPendingInput(null);
    } catch (error: unknown) {
      if (isWrongPassword(error)) {
        setStepUpError(t('stepUp.invalidPassword'));
      } else {
        setPendingInput(null);
        onError(error);
      }
    } finally {
      setIsCreating(false);
    }
  };

  const handleCancel = () => {
    setPendingInput(null);
    setStepUpError(null);
  };

  return {
    isCreating,
    handleCreate,
    stepUpModalProps: {
      isOpen: pendingInput !== null,
      onConfirm: handleConfirm,
      onCancel: handleCancel,
      error: stepUpError,
      isLoading: isCreating,
    },
  };
}
