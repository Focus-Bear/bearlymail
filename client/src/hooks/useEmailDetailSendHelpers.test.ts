import { buildSendReplyFormData, SendReplyPayload } from './useEmailDetailSendHelpers';

vi.mock('config/api', () => ({ API_URL: 'http://api.test' }));

const basePayload: SendReplyPayload = {
  emailId: 'email-1',
  draft: 'Hi there',
  recipients: 'a@example.com',
  cc: null,
  bcc: null,
  replyMode: 'reply',
  files: [new File(['x'], 'a.txt')],
};

describe('buildSendReplyFormData', () => {
  it('appends the per-message open-tracking choice', () => {
    expect(buildSendReplyFormData({ ...basePayload, trackOpens: false }).get('trackOpens')).toBe('false');
    expect(buildSendReplyFormData({ ...basePayload, trackOpens: true }).get('trackOpens')).toBe('true');
  });

  it('omits it when the composer made no choice, so the account setting applies', () => {
    expect(buildSendReplyFormData(basePayload).get('trackOpens')).toBeNull();
  });
});
