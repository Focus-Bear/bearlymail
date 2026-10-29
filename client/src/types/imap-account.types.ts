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

export interface ImapConnectionSettings extends ImapServerSettings {
  email: string;
  password: string;
  name?: string;
  username?: string;
}

/** Codes the server returns when a login fails; each maps to a translated hint. */
export const IMAP_CONNECTION_ERROR_CODES = {
  AUTH_FAILED: 'auth_failed',
  INVALID_SERVER: 'invalid_server',
  CONNECTION_FAILED: 'connection_failed',
  CERTIFICATE_MISMATCH: 'certificate_mismatch',
  TLS_FAILED: 'tls_failed',
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

export type ImapConnectionTestResult =
  | { ok: true; mailboxes: { archive: string | null; sent: string | null; trash: string | null } }
  | { ok: false; failure: ImapConnectionFailure };
