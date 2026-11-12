import { HTTP_FORBIDDEN } from 'constants/numbers';
import { ERROR_CODE_EMAIL_PROVIDER_REQUIRED } from 'constants/strings';

interface HttpErrorShape {
  // eslint-disable-next-line id-denylist -- axios puts the response body on `data`
  response?: { status?: number; data?: { error?: unknown } };
}

/** True when the server refused a request because the user has no email account connected. */
export function isNoMailboxError(error: unknown): boolean {
  const response = (error as HttpErrorShape | null | undefined)?.response;
  return response?.status === HTTP_FORBIDDEN && response.data?.error === ERROR_CODE_EMAIL_PROVIDER_REQUIRED;
}
