import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { isNoMailboxError } from 'utils/mailboxConnection';

import { API_URL } from 'config/api';

export const MAILBOX_STATUS = {
  CHECKING: 'checking',
  CONNECTED: 'connected',
  NONE: 'none',
} as const;

export type MailboxStatus = (typeof MAILBOX_STATUS)[keyof typeof MAILBOX_STATUS];

/**
 * Whether the user has an email account connected. Asks a mailbox-only
 * endpoint: the server's mailbox guard answers with EMAIL_PROVIDER_REQUIRED
 * when there is none. Any other failure (network, server error) counts as
 * connected, so a hiccup never tells someone with a mailbox to connect one.
 */
export function useMailboxConnection(): { status: MailboxStatus; recheck: () => Promise<void> } {
  const [status, setStatus] = useState<MailboxStatus>(MAILBOX_STATUS.CHECKING);
  const mountedRef = useRef(true);

  const recheck = useCallback(async () => {
    let next: MailboxStatus = MAILBOX_STATUS.CONNECTED;
    try {
      await axios.get(`${API_URL}/emails/connected-accounts`);
    } catch (error) {
      if (isNoMailboxError(error)) {
        next = MAILBOX_STATUS.NONE;
      }
    }
    if (mountedRef.current) {
      setStatus(next);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    recheck();
    return () => {
      mountedRef.current = false;
    };
  }, [recheck]);

  return { status, recheck };
}
