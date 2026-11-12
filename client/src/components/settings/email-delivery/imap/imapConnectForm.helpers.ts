import axios from 'axios';
import {
  IMAP_CONNECTION_ERROR_CODES,
  IMAP_PROTOCOLS,
  type ImapConnectionFailure,
  type ImapConnectionSettings,
  type ImapServerSettings,
  type OAuthProviderId,
} from 'types/imap-account.types';

import { IMAP_PORTS, SMTP_PORTS } from 'constants/imap';

export interface ImapConnectFormValues {
  email: string;
  password: string;
  name: string;
  username: string;
  servers: ImapServerSettings;
}

/** Starting point for the hand-entered settings: mail.<domain> over SSL. */
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

/** Only hand-entered servers are sent; otherwise the API finds them itself. */
export function toConnectionSettings(values: ImapConnectFormValues, isManual: boolean): ImapConnectionSettings {
  const base = {
    email: values.email.trim(),
    password: values.password,
    name: values.name.trim() || undefined,
    username: values.username.trim() || undefined,
  };
  if (!isManual) {
return base;
}
  return {
    ...base,
    ...values.servers,
    imapHost: values.servers.imapHost.trim(),
    smtpHost: values.servers.smtpHost.trim(),
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

const OAUTH_PROVIDER_FOR_FAILURE: Partial<Record<ImapConnectionFailure['code'], OAuthProviderId>> = {
  [IMAP_CONNECTION_ERROR_CODES.USE_GMAIL]: 'gmail',
  [IMAP_CONNECTION_ERROR_CODES.USE_OFFICE365]: 'office365',
  [IMAP_CONNECTION_ERROR_CODES.USE_ZOHO]: 'zoho',
};

/** The address belongs to a provider with its own "Sign in with…" button. */
export function oauthProviderFor(failure: ImapConnectionFailure): OAuthProviderId | null {
  return OAUTH_PROVIDER_FOR_FAILURE[failure.code] ?? null;
}

/** Mail-server settings help only when the user is entering them by hand. */
export function shouldOfferManualSettings(failure: ImapConnectionFailure): boolean {
  return failure.code === IMAP_CONNECTION_ERROR_CODES.SERVER_NOT_FOUND;
}
