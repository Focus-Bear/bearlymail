import axios from "axios";

import { formatGaxiosError, isGaxiosError } from "../types/common";

/**
 * Extracts a clean, concise summary from an Axios or Gaxios (Google API) error.
 * Returns only: method, url, status code, and message.
 * Never logs the full config/request/response blobs.
 *
 * For Gaxios errors, delegates to formatGaxiosError for consistent, detailed output.
 *
 * Use this anywhere you log an error that may be an AxiosError or GaxiosError,
 * to prevent verbose CloudWatch log spam.
 *
 * @example
 * } catch (error) {
 *   this.logger.error(`Failed to refresh token: ${sanitizeAxiosError(error)}`, error instanceof Error ? error.stack : undefined);
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
  // Delegate Gaxios (Google API client) errors to the shared formatGaxiosError utility
  if (isGaxiosError(error)) {
    return formatGaxiosError(error);
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
