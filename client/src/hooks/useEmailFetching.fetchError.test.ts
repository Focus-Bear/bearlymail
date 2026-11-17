import type { AppDispatch } from 'store/store';

import { handleFetchError } from './useEmailFetching';

function fetchErrorFor(error: unknown): unknown {
  const dispatch = vi.fn();
  handleFetchError(dispatch as unknown as AppDispatch, error);
  const lastAction = dispatch.mock.calls[dispatch.mock.calls.length - 1]?.[0];
  return lastAction?.payload;
}

describe('handleFetchError', () => {
  it('shows the connect-your-email screen when no mailbox is connected (#442)', () => {
    const noMailbox = {
      isAxiosError: true,
      response: { status: 403, data: { error: 'EMAIL_PROVIDER_REQUIRED', message: 'Email provider connection required.' } },
    };

    expect(fetchErrorFor(noMailbox)).toBe('GMAIL_REQUIRED');
  });

  it('does not treat other 403s as a missing mailbox', () => {
    const otherRefusal = {
      isAxiosError: true,
      response: { status: 403, data: { error: 'MFA_SETUP_REQUIRED', message: 'MFA required' } },
    };

    expect(fetchErrorFor(otherRefusal)).not.toBe('GMAIL_REQUIRED');
  });
});
