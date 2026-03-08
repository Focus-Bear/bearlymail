import { TYPEOF_UNDEFINED } from 'constants/strings';

const CORRELATION_ID_LENGTH = 5;
const CORRELATION_ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/**
 * Generates a short, human-readable 5-character correlation ID (e.g. "A4X2K").
 * Used to correlate error reports shown to users with PostHog error tracking events.
 */
export const generateCorrelationId = (): string => {
  let result = '';
  const charsLength = CORRELATION_ID_CHARS.length;
  for (let i = 0; i < CORRELATION_ID_LENGTH; i++) {
    result += CORRELATION_ID_CHARS.charAt(Math.floor(Math.random() * charsLength));
  }
  return result;
};

const NETWORK_ERROR_PATTERNS = [
  'network error',
  'failed to fetch',
  'networkerror',
  'err_network',
  'err_internet_disconnected',
  'err_name_not_resolved',
  'net::err',
  'network request failed',
  'load failed',
];

/**
 * Detects whether an error is likely caused by poor or absent network connectivity.
 * Checks navigator.onLine first, then falls back to matching known network error patterns.
 */
export const isNetworkError = (error: Error): boolean => {
  if (typeof navigator !== TYPEOF_UNDEFINED && !navigator.onLine) {
    return true;
  }
  const message = error.message?.toLowerCase() ?? '';
  const name = error.name?.toLowerCase() ?? '';
  return NETWORK_ERROR_PATTERNS.some(pattern => message.includes(pattern) || name.includes(pattern));
};
