import { useCallback, useState } from 'react';
import axios from 'axios';
import type {
  ImapAccountSummary,
  ImapConnectionFailure,
  ImapConnectionTestResult,
  ImapServerSettings,
} from 'types/imap-account.types';

import { API_URL } from 'config/api';
import { IMAP_ENDPOINTS } from 'constants/imap';

import {
  failureFromError,
  fallbackServersFor,
  type ImapConnectFormValues,
  toConnectionSettings,
} from './imapConnectForm.helpers';

export const IMAP_FORM_STATUS = {
  IDLE: 'idle',
  WORKING: 'working',
  TESTED: 'tested',
  FAILED: 'failed',
} as const;

export type ImapFormStatus =
  | { kind: typeof IMAP_FORM_STATUS.IDLE }
  | { kind: typeof IMAP_FORM_STATUS.WORKING }
  | { kind: typeof IMAP_FORM_STATUS.TESTED }
  | { kind: typeof IMAP_FORM_STATUS.FAILED; failure: ImapConnectionFailure };

type TextField = 'email' | 'password' | 'name' | 'username';
const EMAIL_FIELD: TextField = 'email';

const EMPTY_VALUES: ImapConnectFormValues = {
  email: '',
  password: '',
  name: '',
  username: '',
  servers: fallbackServersFor(''),
};

/**
 * State and API calls for connecting an IMAP/SMTP mailbox. Server settings
 * are suggested from the address until the user edits them by hand.
 */
export function useImapConnectForm(options: {
  initialEmail?: string;
  onConnected: (account: ImapAccountSummary) => void;
}) {
  const [values, setValues] = useState<ImapConnectFormValues>(() => ({
    ...EMPTY_VALUES,
    email: options.initialEmail ?? '',
    servers: fallbackServersFor(options.initialEmail ?? ''),
  }));
  const [serversEdited, setServersEdited] = useState(false);
  const [status, setStatus] = useState<ImapFormStatus>({ kind: IMAP_FORM_STATUS.IDLE });

  const setField = useCallback(
    (field: TextField, value: string) =>
      setValues(current => {
        const next = { ...current, [field]: value };
        // Fill mail.<domain> as they type; the server suggestion refines it on blur.
        return field === EMAIL_FIELD && !serversEdited ? { ...next, servers: fallbackServersFor(value) } : next;
      }),
    [serversEdited]
  );

  const setServers = useCallback((servers: ImapServerSettings) => {
    setServersEdited(true);
    setValues(current => ({ ...current, servers }));
  }, []);

  const suggestServers = useCallback(async () => {
    if (serversEdited || !values.email.includes('@')) {
      return;
    }
    const fallback = fallbackServersFor(values.email);
    try {
      const response = await axios.get<{ servers: ImapServerSettings | null }>(`${API_URL}${IMAP_ENDPOINTS.SUGGEST}`, {
        params: { email: values.email },
      });
      setValues(current => ({ ...current, servers: response.data.servers ?? fallback }));
    } catch {
      setValues(current => ({ ...current, servers: fallback }));
    }
  }, [serversEdited, values.email]);

  const testConnection = useCallback(async () => {
    setStatus({ kind: IMAP_FORM_STATUS.WORKING });
    try {
      const response = await axios.post<ImapConnectionTestResult>(
        `${API_URL}${IMAP_ENDPOINTS.TEST}`,
        toConnectionSettings(values)
      );
      const result = response.data;
      setStatus(
        result.ok ? { kind: IMAP_FORM_STATUS.TESTED } : { kind: IMAP_FORM_STATUS.FAILED, failure: result.failure }
      );
    } catch (error) {
      setStatus({ kind: IMAP_FORM_STATUS.FAILED, failure: failureFromError(error) });
    }
  }, [values]);

  const connect = useCallback(async () => {
    setStatus({ kind: IMAP_FORM_STATUS.WORKING });
    try {
      const response = await axios.post<{ account: ImapAccountSummary }>(
        `${API_URL}${IMAP_ENDPOINTS.CONNECT}`,
        toConnectionSettings(values)
      );
      setStatus({ kind: IMAP_FORM_STATUS.IDLE });
      options.onConnected(response.data.account);
    } catch (error) {
      setStatus({ kind: IMAP_FORM_STATUS.FAILED, failure: failureFromError(error) });
    }
  }, [options, values]);

  const canSubmit =
    values.email.includes('@') &&
    values.password.length > 0 &&
    !!values.servers.imapHost.trim() &&
    !!values.servers.smtpHost.trim() &&
    status.kind !== IMAP_FORM_STATUS.WORKING;

  return { values, status, canSubmit, setField, setServers, suggestServers, testConnection, connect };
}
