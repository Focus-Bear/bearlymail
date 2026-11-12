import { isNoMailboxError } from './mailboxConnection';

describe('isNoMailboxError', () => {
  it('recognises the server refusing because no email account is connected', () => {
    expect(isNoMailboxError({ response: { status: 403, data: { error: 'EMAIL_PROVIDER_REQUIRED' } } })).toBe(true);
  });

  it.each([
    ['another 403 (e.g. admin MFA)', { response: { status: 403, data: { error: 'MFA_SETUP_REQUIRED' } } }],
    ['the same code on another status', { response: { status: 401, data: { error: 'EMAIL_PROVIDER_REQUIRED' } } }],
    ['a network error', { message: 'Network Error' }],
    ['nothing', undefined],
  ])('ignores %s', (_label, error) => {
    expect(isNoMailboxError(error)).toBe(false);
  });
});
