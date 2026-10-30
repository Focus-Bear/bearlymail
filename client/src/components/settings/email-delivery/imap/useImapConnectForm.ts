import { useCallback, useState } from 'react';
import axios from 'axios';
import type { ImapAccountSummary, ImapConnectionFailure, ImapServerSettings } from 'types/imap-account.types';

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
  FAILED: 'failed',
} as const;

export type ImapFormStatus =
  | { kind: typeof IMAP_FORM_STATUS.IDLE }
  | { kind: typeof IMAP_FORM_STATUS.WORKING }
  | { kind: typeof IMAP_FORM_STATUS.FAILED; failure: ImapConnectionFailure };

type TextField = 'email' | 'password' | 'name' | 'username';

/**
 * State for connecting a mailbox with just an address and password: the API
 * finds the servers. Server fields are only sent if the user opens them.
 */
export function useImapConnectForm(options: {
  initialEmail?: string;
  onConnected: (account: ImapAccountSummary) => void;
}) {
  const [values, setValues] = useState<ImapConnectFormValues>(() => ({
    email: options.initialEmail ?? '',
    password: '',
    name: '',
    username: '',
    servers: fallbackServersFor(options.initialEmail ?? ''),
  }));
  const [isManual, setIsManual] = useState(false);
  const [status, setStatus] = useState<ImapFormStatus>({ kind: IMAP_FORM_STATUS.IDLE });

  const setField = useCallback(
    (field: TextField, value: string) => setValues(current => ({ ...current, [field]: value })),
    []
  );

  const [serversEdited, setServersEdited] = useState(false);

  const setServers = useCallback((servers: ImapServerSettings) => {
    setServersEdited(true);
    setValues(current => ({ ...current, servers }));
  }, []);

  const toggleManual = useCallback(() => {
    // Prefill from the address when the fields open, unless the user has typed in them.
    if (!isManual && !serversEdited) {
      setValues(latest => ({ ...latest, servers: fallbackServersFor(latest.email) }));
    }
    setIsManual(!isManual);
    // Any earlier error was about the other mode ("enter the settings yourself").
    setStatus({ kind: IMAP_FORM_STATUS.IDLE });
  }, [isManual, serversEdited]);

  const connect = useCallback(async () => {
    setStatus({ kind: IMAP_FORM_STATUS.WORKING });
    try {
      const response = await axios.post<{ account: ImapAccountSummary }>(
        `${API_URL}${IMAP_ENDPOINTS.CONNECT}`,
        toConnectionSettings(values, isManual)
      );
      setStatus({ kind: IMAP_FORM_STATUS.IDLE });
      options.onConnected(response.data.account);
    } catch (error) {
      setStatus({ kind: IMAP_FORM_STATUS.FAILED, failure: failureFromError(error) });
    }
  }, [isManual, options, values]);

  const hasServers = !!values.servers.imapHost.trim() && !!values.servers.smtpHost.trim();
  const canSubmit =
    values.email.includes('@') &&
    values.password.length > 0 &&
    (!isManual || hasServers) &&
    status.kind !== IMAP_FORM_STATUS.WORKING;

  return { values, status, isManual, canSubmit, setField, setServers, toggleManual, connect };
}
