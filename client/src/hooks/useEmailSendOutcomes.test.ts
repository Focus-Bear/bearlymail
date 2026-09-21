import { renderHook, waitFor } from '@testing-library/react';
import axios from 'axios';
import { takeComposeRestore } from 'utils/composeRestore';
import { PENDING_SEND_KIND, rememberPendingSend, takePendingSend } from 'utils/pendingSends';

import { API_URL } from 'config/api';
import { EMAIL_SEND_FAILURE_REASON, EmailSendFailureReason, PUSHER_EVENTS, userChannel } from 'constants/pusher-events';

import { useEmailSendOutcomes } from './useEmailSendOutcomes';

vi.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

const mockShowErrorWithAction = vi.fn(() => vi.fn());
vi.mock('contexts/NotificationContext', () => ({
  useNotifications: () => ({ showErrorWithAction: mockShowErrorWithAction }),
}));

vi.mock('contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const handlers: Record<string, (event: unknown) => void> = {};
const mockChannel = {
  bind: vi.fn((event: string, handler: (event: unknown) => void) => {
    handlers[event] = handler;
  }),
  unbind: vi.fn(),
};
const mockSubscribe = vi.fn(() => mockChannel);
vi.mock('config/pusher', () => ({
  getPusherInstance: () => ({
    subscribe: mockSubscribe,
    unsubscribe: vi.fn(),
  }),
}));

const SEND_ID = 'send-1';
const EMAIL_ID = 'email-1';
const THREAD_ID = 'thread-1';

function emitFailure(reason: EmailSendFailureReason = EMAIL_SEND_FAILURE_REASON.PROVIDER_REJECTED) {
  handlers[PUSHER_EVENTS.EMAIL_SEND_FAILED]({
    sendId: SEND_ID,
    sendType: 'reply',
    emailId: EMAIL_ID,
    reason,
  });
}

describe('useEmailSendOutcomes', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    vi.clearAllMocks();
    mockedAxios.post = vi.fn().mockResolvedValue({ data: {} });
  });

  it('subscribes on the authenticated user\'s private channel', () => {
    renderHook(() => useEmailSendOutcomes());

    expect(mockSubscribe).toHaveBeenCalledWith(userChannel('user-1'));
    expect(mockSubscribe).toHaveBeenCalledWith(expect.stringMatching(/^private-/));
  });

  it('subscribes to both send outcome events', () => {
    renderHook(() => useEmailSendOutcomes());

    expect(mockChannel.bind).toHaveBeenCalledWith(PUSHER_EVENTS.EMAIL_SEND_SUCCEEDED, expect.any(Function));
    expect(mockChannel.bind).toHaveBeenCalledWith(PUSHER_EVENTS.EMAIL_SEND_FAILED, expect.any(Function));
  });

  it('clears the pending record on success without notifying the user', () => {
    rememberPendingSend({
      sendId: SEND_ID,
      kind: PENDING_SEND_KIND.REPLY,
      emailId: EMAIL_ID,
      threadId: THREAD_ID,
      draft: 'Hello',
      recipients: 'a@example.com',
      cc: null,
      bcc: null,
      replyMode: 'reply',
    });
    renderHook(() => useEmailSendOutcomes());

    handlers[PUSHER_EVENTS.EMAIL_SEND_SUCCEEDED]({
      sendId: SEND_ID,
      sendType: 'reply',
      emailId: EMAIL_ID,
      messageId: 'msg-1',
      threadId: THREAD_ID,
    });

    expect(takePendingSend(SEND_ID)).toBeNull();
    expect(mockShowErrorWithAction).not.toHaveBeenCalled();
  });

  describe('on failure', () => {
    beforeEach(() => {
      rememberPendingSend({
        sendId: SEND_ID,
        kind: PENDING_SEND_KIND.REPLY,
        emailId: EMAIL_ID,
        threadId: THREAD_ID,
        draft: 'Hello there',
        recipients: 'a@example.com',
        cc: null,
        bcc: null,
        replyMode: 'reply',
      });
    });

    it('tells the user the message was not sent and offers a retry', async () => {
      renderHook(() => useEmailSendOutcomes());

      emitFailure();

      await waitFor(() => expect(mockShowErrorWithAction).toHaveBeenCalled());
      const [message, action] = mockShowErrorWithAction.mock.calls[0] as unknown as [
        string,
        { label: string; onClick: () => void },
      ];
      expect(message).toBe('emailSend.failedNotification');
      expect(action.label).toBe('emailSend.retryAction');

      action.onClick();
      expect(mockNavigate).toHaveBeenCalledWith(`/email/${EMAIL_ID}`);
    });

    it('restores the reply draft so the retry is not blank', async () => {
      renderHook(() => useEmailSendOutcomes());

      emitFailure();

      await waitFor(() =>
        expect(mockedAxios.post).toHaveBeenCalledWith(`${API_URL}/drafts/thread/${THREAD_ID}`, {
          content: 'Hello there',
          replyMode: 'reply',
          recipients: 'a@example.com',
        })
      );
    });

    it('surfaces an unconfirmed delivery rather than a rejection', async () => {
      renderHook(() => useEmailSendOutcomes());

      emitFailure(EMAIL_SEND_FAILURE_REASON.UNCONFIRMED);

      await waitFor(() => expect(mockShowErrorWithAction).toHaveBeenCalled());
      // The reason is interpolated, so only the key reaches the mocked t().
      const [message] = mockShowErrorWithAction.mock.calls[0] as unknown as [string];
      expect(message).toBe('emailSend.failedNotification');
    });

    it('parks a failed composed message for the compose page to restore', async () => {
      window.localStorage.clear();
      rememberPendingSend({
        sendId: SEND_ID,
        kind: PENDING_SEND_KIND.COMPOSE,
        to: [{ email: 'a@example.com' }],
        cc: [],
        bcc: [],
        subject: 'Hi',
        body: 'Body',
      });
      renderHook(() => useEmailSendOutcomes());

      handlers[PUSHER_EVENTS.EMAIL_SEND_FAILED]({
        sendId: SEND_ID,
        sendType: 'new',
        reason: EMAIL_SEND_FAILURE_REASON.PROVIDER_REJECTED,
      });

      await waitFor(() => expect(mockShowErrorWithAction).toHaveBeenCalled());
      expect(takeComposeRestore()).toEqual({
        to: [{ email: 'a@example.com' }],
        cc: [],
        bcc: [],
        subject: 'Hi',
        body: 'Body',
      });

      const [, action] = mockShowErrorWithAction.mock.calls[0] as unknown as [
        string,
        { label: string; onClick: () => void },
      ];
      action.onClick();
      expect(mockNavigate).toHaveBeenCalledWith('/compose');
    });
  });
});
