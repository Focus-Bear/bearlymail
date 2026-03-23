import axios from 'axios';

/**
 * Extracts a human-readable error message from an unknown caught value.
 * Handles axios errors (uses server response message), Error instances, and strings.
 */
export function getAxiosErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    return (err.response?.data as { message?: string } | undefined)?.message ?? fallback;
  }
  if (err instanceof Error) {
    return err.message || fallback;
  }
  return fallback;
}

/**
 * Extracts a human-readable message from an unknown caught value.
 * Does not assume axios — use for non-HTTP errors.
 */
export function getErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) {
    return err.message || fallback;
  }
  return fallback;
}
