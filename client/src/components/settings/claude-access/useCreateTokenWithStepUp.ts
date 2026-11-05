import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isPasswordChallenge, isWrongPassword, requestStepUpToken } from 'utils/stepUpRequest';

import { CreatedPersonalAccessToken, CreatePersonalAccessTokenInput } from './types';

type CreateToken = (input: CreatePersonalAccessTokenInput, stepUpToken: string) => Promise<CreatedPersonalAccessToken>;

interface UseCreateTokenWithStepUpParams {
  createToken: CreateToken;
  onCreated: (created: CreatedPersonalAccessToken) => void;
  onError: (error: unknown) => void;
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
