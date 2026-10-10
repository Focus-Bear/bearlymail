import { useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { stashComposeRestore } from 'utils/composeRestore';
import { PENDING_SEND_KIND, PendingSend, takePendingSend } from 'utils/pendingSends';

import { API_URL } from 'config/api';
import { getPusherInstance } from 'config/pusher';
import {
  EMAIL_SEND_FAILURE_REASON,
  EmailSendFailedEvent,
  EmailSendFailureReason,
  EmailSendSucceededEvent,
  PUSHER_EVENTS,
  userChannel,
} from 'constants/pusher-events';
import { useAuth } from 'contexts/AuthContext';
import { useNotifications } from 'contexts/NotificationContext';

const COMPOSE_ROUTE = '/compose';
const EMAIL_DETAIL_ROUTE_PREFIX = '/email/';

/** Translation key describing each failure the server can report. */
const FAILURE_REASON_KEYS: Record<EmailSendFailureReason, string> = {
  [EMAIL_SEND_FAILURE_REASON.PROVIDER_REJECTED]: 'emailSend.failure.providerRejected',
  [EMAIL_SEND_FAILURE_REASON.UNCONFIRMED]: 'emailSend.failure.unconfirmed',
};

/**
 * Restores the reply draft the user thought they had sent, so Retry opens the
 * composer with their text instead of a blank box.
 */
async function restoreReplyDraft(pending: Extract<PendingSend, { kind: typeof PENDING_SEND_KIND.REPLY }>): Promise<void> {
  if (!pending.threadId || !pending.draft.trim()) {
    return;
  }
  try {
    await axios.post(`${API_URL}/drafts/thread/${pending.threadId}`, {
      content: pending.draft,
      replyMode: pending.replyMode,
      recipients: pending.recipients,
    });
  } catch (error) {
    console.error('Failed to restore reply draft after send failure:', error);
  }
}

/**
 * Turns the outcome of a background send into UI.
 *
 * Sends are accepted by the server before the mail provider is contacted, so
 * the composer's "sent" state is optimistic. This listens for the confirming
 * (or contradicting) Pusher event on the user's channel and, on failure, tells
 * the user their message did NOT go out, restores what they wrote, and offers a
 * retry — instead of leaving a false "sent" behind.
 *
 * Mounted once at the app root: the user has usually navigated away from the
 * composer by the time the outcome lands.
 */
export function useEmailSendOutcomes(): void {
  const { user } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { showErrorWithAction } = useNotifications();
  const userId = user?.id;

  const handleFailure = useCallback(
    async (event: EmailSendFailedEvent) => {
      const pending = takePendingSend(event.sendId);
      const reason = t(FAILURE_REASON_KEYS[event.reason] ?? 'emailSend.failure.unknown');

      if (pending?.kind === PENDING_SEND_KIND.REPLY) {
        await restoreReplyDraft(pending);
      } else if (pending?.kind === PENDING_SEND_KIND.COMPOSE) {
        const { to, cc, bcc, subject, body } = pending;
        stashComposeRestore({ to, cc, bcc, subject, body });
      }

      const retryPath =
        pending?.kind === PENDING_SEND_KIND.COMPOSE ? COMPOSE_ROUTE : `${EMAIL_DETAIL_ROUTE_PREFIX}${event.emailId ?? ''}`;
      let dismiss: (() => void) | undefined;
      dismiss = showErrorWithAction(t('emailSend.failedNotification', { reason }), {
        label: t('emailSend.retryAction'),
        onClick: () => {
          dismiss?.();
          navigate(retryPath);
        },
      });
    },
    [navigate, showErrorWithAction, t]
  );

  useEffect(() => {
    if (!userId) {
      return;
    }
    const pusher = getPusherInstance();
    if (!pusher) {
      return;
    }

    const channel = pusher.subscribe(userChannel(userId));

    // Success only needs to clear the local record — the optimistic UI already
    // shows the message as sent.
    const onSucceeded = (event: EmailSendSucceededEvent) => {
      takePendingSend(event.sendId);
    };
    const onFailed = (event: EmailSendFailedEvent) => {
      void handleFailure(event);
    };

    channel.bind(PUSHER_EVENTS.EMAIL_SEND_SUCCEEDED, onSucceeded);
    channel.bind(PUSHER_EVENTS.EMAIL_SEND_FAILED, onFailed);

    return () => {
      // Unbind only our own handlers: the channel is shared with other features
      // (contact sync), so unbind_all/unsubscribe here would break theirs.
      channel.unbind(PUSHER_EVENTS.EMAIL_SEND_SUCCEEDED, onSucceeded);
      channel.unbind(PUSHER_EVENTS.EMAIL_SEND_FAILED, onFailed);
    };
  }, [userId, handleFailure]);
}
