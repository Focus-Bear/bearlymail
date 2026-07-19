import axios from 'axios';

export const MFA_VERIFICATION_REQUIRED = 'MFA_VERIFICATION_REQUIRED';
export const MFA_SETUP_REQUIRED = 'MFA_SETUP_REQUIRED';
const HTTP_FORBIDDEN = 403;

export type MfaErrorType = typeof MFA_VERIFICATION_REQUIRED | typeof MFA_SETUP_REQUIRED | null;

/** Returns the MFA error type if the error is a 403 MFA challenge, otherwise null. */
export function getMfaErrorType(error: unknown): MfaErrorType {
  if (!axios.isAxiosError(error) || error.response?.status !== HTTP_FORBIDDEN) {
return null;
}
  const body = error.response.data as { error?: string } | undefined;
  if (body?.error === MFA_VERIFICATION_REQUIRED) {
return MFA_VERIFICATION_REQUIRED;
}
  if (body?.error === MFA_SETUP_REQUIRED) {
return MFA_SETUP_REQUIRED;
}
  return null;
}
