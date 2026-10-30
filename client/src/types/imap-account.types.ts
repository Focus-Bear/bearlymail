/** An IMAP/SMTP mailbox as the API returns it — never includes the password. */
export interface ImapAccountSummary {
  id: string;
  email: string;
  name?: string | null;
  imapHost: string;
  smtpHost: string;
  isPrimary?: boolean;
  needsRelogin: boolean;
  lastError: string | null;
}

export interface ImapServerSettings {
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
}

/** Servers are omitted unless the user entered them by hand: the API finds them. */
export interface ImapConnectionSettings extends Partial<ImapServerSettings> {
  email: string;
  password: string;
  name?: string;
  username?: string;
}

export type OAuthProviderId = 'gmail' | 'office365' | 'zoho';

/** Codes the server returns when a login fails; each maps to a translated hint. */
export const IMAP_CONNECTION_ERROR_CODES = {
  AUTH_FAILED: 'auth_failed',
  INVALID_SERVER: 'invalid_server',
  CONNECTION_FAILED: 'connection_failed',
  CERTIFICATE_MISMATCH: 'certificate_mismatch',
  TLS_FAILED: 'tls_failed',
  SERVER_NOT_FOUND: 'server_not_found',
  USE_GMAIL: 'use_gmail',
  USE_OFFICE365: 'use_office365',
  USE_ZOHO: 'use_zoho',
  UNKNOWN: 'unknown',
} as const;

export type ImapConnectionErrorCode = (typeof IMAP_CONNECTION_ERROR_CODES)[keyof typeof IMAP_CONNECTION_ERROR_CODES];

export const IMAP_PROTOCOLS = { IMAP: 'imap', SMTP: 'smtp' } as const;

export type ImapProtocol = (typeof IMAP_PROTOCOLS)[keyof typeof IMAP_PROTOCOLS];

export interface ImapConnectionFailure {
  protocol: ImapProtocol;
  code: ImapConnectionErrorCode;
  detail: string;
}
