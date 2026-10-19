import axios from 'axios';

import { buildSendReplyFormData, type SendReplyPayload,sendReplyRequest } from './useEmailDetailSendHelpers';

vi.mock('axios', () => ({
  default: { post: vi.fn() },
}));

vi.mock('config/api', () => ({
  API_URL: 'http://api.test',
}));

const mockedPost = vi.mocked(axios.post);

// 10:17am Friday 16 Oct in Melbourne — still Thursday 15 Oct in UTC.
const MELBOURNE_MORNING = new Date('2026-10-15T23:17:00.000Z');
// "tomorrow" in Melbourne: Saturday 17 Oct, 8am AEDT. A UTC server parsing the
// text itself would follow up at 7pm the same Friday.
const MELBOURNE_TOMORROW_8AM = '2026-10-16T21:00:00.000Z';

const basePayload: SendReplyPayload = {
  emailId: 'email-1',
  draft: 'Thanks!',
  recipients: 'friend@example.com',
  cc: null,
  bcc: null,
  replyMode: 'reply',
  files: [],
};

describe("reply follow-up instant in the user's timezone", () => {
  beforeEach(() => {
    mockedPost.mockReset();
    mockedPost.mockResolvedValue({ data: { sendId: 'send-1' } });
    vi.stubEnv('TZ', 'Australia/Melbourne');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(MELBOURNE_MORNING);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('sends the resolved instant with the JSON reply', async () => {
    await sendReplyRequest({ ...basePayload, expectedReplyDuration: 'tomorrow' });

    expect(mockedPost.mock.calls[0][0]).toBe('http://api.test/replies/send/email-1');
    expect(mockedPost.mock.calls[0][1]).toMatchObject({
      expectedReplyDuration: 'tomorrow',
      expectedReplyAt: MELBOURNE_TOMORROW_8AM,
    });
  });

  it('appends the resolved instant to the multipart reply', () => {
    const formData = buildSendReplyFormData({ ...basePayload, expectedReplyDuration: 'tomorrow' });

    expect(formData.get('expectedReplyDuration')).toBe('tomorrow');
    expect(formData.get('expectedReplyAt')).toBe(MELBOURNE_TOMORROW_8AM);
  });

  it('sends no instant when only a preset hours window was chosen', async () => {
    await sendReplyRequest({ ...basePayload, expectedReplyHours: 48 });

    expect((mockedPost.mock.calls[0][1] as Record<string, unknown>).expectedReplyAt).toBeUndefined();
  });
});

describe('buildSendReplyFormData', () => {
  it('appends the per-message open-tracking choice', () => {
    expect(buildSendReplyFormData({ ...basePayload, trackOpens: false }).get('trackOpens')).toBe('false');
    expect(buildSendReplyFormData({ ...basePayload, trackOpens: true }).get('trackOpens')).toBe('true');
  });

  it('omits it when the composer made no choice, so the account setting applies', () => {
    expect(buildSendReplyFormData(basePayload).get('trackOpens')).toBeNull();
  });
});
