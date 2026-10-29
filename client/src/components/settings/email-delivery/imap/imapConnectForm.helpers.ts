import axios from 'axios';
import {
  IMAP_CONNECTION_ERROR_CODES,
  IMAP_PROTOCOLS,
  type ImapConnectionFailure,
  type ImapConnectionSettings,
  type ImapServerSettings,
} from 'types/imap-account.types';

import { IMAP_PORTS, SMTP_PORTS } from 'constants/imap';

export interface ImapConnectFormValues {
  email: string;
  password: string;
  name: string;
  username: string;
  servers: ImapServerSettings;
}

/** Hosted-domain defaults (Crazy Domains, cPanel): mail.<domain> over SSL. */
export function fallbackServersFor(email: string): ImapServerSettings {
  const domain = email.split('@')[1]?.trim().toLowerCase() ?? '';
  const host = domain ? `mail.${domain}` : '';
  return {
    imapHost: host,
    imapPort: IMAP_PORTS.SSL,
    imapSecure: true,
    smtpHost: host,
    smtpPort: SMTP_PORTS.SSL,
    smtpSecure: true,
  };
}

/** Switching SSL <-> STARTTLS moves a default port to its partner; custom ports stay. */
export function portForSecurity(
  currentPort: number,
  secure: boolean,
  ports: { SSL: number; STARTTLS: number }
): number {
  const isDefault = currentPort === ports.SSL || currentPort === ports.STARTTLS;
  if (!isDefault) {
    return currentPort;
  }
  return secure ? ports.SSL : ports.STARTTLS;
}

export function toConnectionSettings(values: ImapConnectFormValues): ImapConnectionSettings {
  return {
    ...values.servers,
    imapHost: values.servers.imapHost.trim(),
    smtpHost: values.servers.smtpHost.trim(),
    email: values.email.trim(),
    password: values.password,
    name: values.name.trim() || undefined,
    username: values.username.trim() || undefined,
  };
}

/** The server explains a failed connect in `failure`; anything else is unknown. */
export function failureFromError(error: unknown): ImapConnectionFailure {
  if (axios.isAxiosError(error)) {
    const failure = (error.response?.data as { failure?: ImapConnectionFailure } | undefined)?.failure;
    if (failure) {
      return failure;
    }
  }
  return {
    protocol: IMAP_PROTOCOLS.IMAP,
    code: IMAP_CONNECTION_ERROR_CODES.UNKNOWN,
    detail: error instanceof Error ? error.message : String(error),
  };
}

/** Wrong passwords are the commonest failure; say which login was rejected. */
export function failureMessageKey(failure: ImapConnectionFailure): string {
  if (failure.code === IMAP_CONNECTION_ERROR_CODES.AUTH_FAILED) {
    return `settings.imap.errors.auth_failed_${failure.protocol}`;
  }
  return `settings.imap.errors.${failure.code}`;
}
