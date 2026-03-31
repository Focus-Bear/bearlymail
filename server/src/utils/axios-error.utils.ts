import axios from "axios";

/**
 * Extracts a clean, concise summary from an axios error.
 * Returns only: method, url, status code, and message.
 * Never logs the full config/request/response blobs.
 *
 * Use this anywhere you log an error that may be an AxiosError,
 * to prevent verbose CloudWatch log spam.
 *
 * @example
 * } catch (error) {
 *   this.logger.error(`Failed to refresh token: ${sanitizeAxiosError(error)}`);
 * }
 */
export function sanitizeAxiosError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const method = error.config?.method?.toUpperCase() ?? "UNKNOWN";
    const url = error.config?.url ?? "unknown-url";
    const status = error.response?.status ?? "no-response";
    const { message } = error;
    return `${method} ${url} → ${status}: ${message}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
