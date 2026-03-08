import { theme } from 'theme/theme';

import {
  ERROR_TYPE_NETWORK_ERROR,
  ERROR_TYPE_PARSE_ERROR,
  ERROR_TYPE_RATE_LIMIT,
  ERROR_TYPE_TIMEOUT,
  ERROR_TYPE_TOKEN_LIMIT,
  STATUS_COMPLETED,
  STATUS_FAILED,
  STATUS_PENDING,
  STATUS_RUNNING,
} from 'constants/strings';

/** Converts an ISO date string into a human-readable locale string. */
export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString();
}

/** Returns the theme colour associated with a given context analysis status. */
export function getStatusColor(status: string): string {
  switch (status) {
    case STATUS_FAILED:
      return theme.colors.accent.error;
    case STATUS_RUNNING:
      return theme.colors.accent.info;
    case STATUS_COMPLETED:
      return theme.colors.accent.success;
    case STATUS_PENDING:
      return theme.colors.accent.warning;
    default:
      return theme.colors.text.secondary;
  }
}

/** Returns the theme colour associated with a given LLM batch error type. */
export function getErrorTypeColor(errorType: string | null): string {
  switch (errorType) {
    case ERROR_TYPE_RATE_LIMIT:
      return theme.colors.accent.error;
    case ERROR_TYPE_TIMEOUT:
      return theme.colors.accent.warning;
    case ERROR_TYPE_TOKEN_LIMIT:
      return theme.colors.accent.warning;
    case ERROR_TYPE_PARSE_ERROR:
      return theme.colors.accent.info;
    case ERROR_TYPE_NETWORK_ERROR:
      return theme.colors.accent.error;
    default:
      return theme.colors.text.secondary;
  }
}
