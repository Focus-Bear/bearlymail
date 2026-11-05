import axios from 'axios';

import { API_URL } from 'config/api';
import { HTTP_UNAUTHORIZED } from 'constants/numbers';

export const STEP_UP_TOKEN_HEADER = 'X-Step-Up-Token';

/** OAuth-only users get a token straight away; password users need `password`. */
export async function requestStepUpToken(password?: string): Promise<string> {
  const response = await axios.post<{ step_up_token: string }>(
    `${API_URL}/auth/step-up`,
    password ? { password } : {}
  );
  return response.data.step_up_token;
}

/** The server wants the user's password before it issues a step-up token. */
export function isPasswordChallenge(error: unknown): boolean {
  return (
    axios.isAxiosError(error) &&
    error.response?.status === HTTP_UNAUTHORIZED &&
    Boolean((error.response.data as { requiresPassword?: boolean } | undefined)?.requiresPassword)
  );
}

export function isWrongPassword(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === HTTP_UNAUTHORIZED;
}
