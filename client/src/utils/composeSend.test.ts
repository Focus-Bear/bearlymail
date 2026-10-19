import axios from 'axios';

import { type ComposeSendArgs,postComposedEmail } from './composeSend';

vi.mock('axios', () => ({
  default: { post: vi.fn() },
}));

vi.mock('config/api', () => ({
  API_URL: 'http://api.test',
}));

const mockedPost = vi.mocked(axios.post);

const baseArgs: ComposeSendArgs = {
  to: [{ email: 'friend@example.com' }],
  cc: [],
  bcc: [],
  subject: 'Hello',
  body: 'Body text',
  attachments: [],
  userTimezone: 'Australia/Melbourne',
  locale: 'en',
  trackOpens: true,
};

describe('postComposedEmail', () => {
  beforeEach(() => {
    mockedPost.mockReset();
    mockedPost.mockResolvedValue({ data: { sendId: 'send-1' } });
  });

  describe('JSON path (no attachments)', () => {
    it('sends the follow-up duration and the UI locale', async () => {
      await postComposedEmail({ ...baseArgs, expectedReplyDuration: '48h' });

      const [url, payload] = mockedPost.mock.calls[0];
      expect(url).toBe('http://api.test/emails/send');
      expect(payload).toMatchObject({ expectedReplyDuration: '48h', locale: 'en' });
    });

    it('omits the duration and the locale when the field was cleared', async () => {
      await postComposedEmail(baseArgs);

      const payload = mockedPost.mock.calls[0][1] as Record<string, unknown>;
      expect(payload.expectedReplyDuration).toBeUndefined();
      expect(payload.locale).toBeUndefined();
    });

    it('sends the per-message open-tracking choice', async () => {
      await postComposedEmail({ ...baseArgs, trackOpens: false });

      expect(mockedPost.mock.calls[0][1]).toMatchObject({ trackOpens: false });
    });

    it('passes a natural-language duration through untouched', async () => {
      await postComposedEmail({ ...baseArgs, expectedReplyDuration: 'next Monday', locale: 'es' });

      expect(mockedPost.mock.calls[0][1]).toMatchObject({
        expectedReplyDuration: 'next Monday',
        locale: 'es',
      });
    });
  });

  describe('FormData path (with attachments)', () => {
    const attachment = () => new File(['data'], 'report.pdf', { type: 'application/pdf' });

    it('appends the follow-up duration and the UI locale', async () => {
      await postComposedEmail({
        ...baseArgs,
        attachments: [attachment()],
        expectedReplyDuration: '3d',
      });

      const formData = mockedPost.mock.calls[0][1] as FormData;
      expect(formData).toBeInstanceOf(FormData);
      expect(formData.get('expectedReplyDuration')).toBe('3d');
      expect(formData.get('locale')).toBe('en');
    });

    it('appends the per-message open-tracking choice', async () => {
      await postComposedEmail({ ...baseArgs, attachments: [attachment()], trackOpens: false });

      const formData = mockedPost.mock.calls[0][1] as FormData;
      expect(formData.get('trackOpens')).toBe('false');
    });

    it('appends neither field when the follow-up was cleared', async () => {
      await postComposedEmail({ ...baseArgs, attachments: [attachment()] });

      const formData = mockedPost.mock.calls[0][1] as FormData;
      expect(formData.get('expectedReplyDuration')).toBeNull();
      expect(formData.get('locale')).toBeNull();
    });
  });

  describe("follow-up instant in the user's timezone", () => {
    // 10:17am Friday 16 Oct in Melbourne — still Thursday 15 Oct in UTC.
    const melbourneMorning = new Date('2026-10-15T23:17:00.000Z');
    // "tomorrow" in Melbourne: Saturday 17 Oct, 8am AEDT. A UTC server parsing
    // the text itself would follow up at 7pm the same Friday.
    const melbourneTomorrow8am = '2026-10-16T21:00:00.000Z';

    beforeEach(() => {
      vi.stubEnv('TZ', 'Australia/Melbourne');
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(melbourneMorning);
    });

    afterEach(() => {
      vi.useRealTimers();
      vi.unstubAllEnvs();
    });

    it('sends the resolved instant on the JSON path', async () => {
      await postComposedEmail({ ...baseArgs, expectedReplyDuration: 'tomorrow' });

      expect(mockedPost.mock.calls[0][1]).toMatchObject({
        expectedReplyDuration: 'tomorrow',
        expectedReplyAt: melbourneTomorrow8am,
      });
    });

    it('appends the resolved instant on the FormData path', async () => {
      await postComposedEmail({
        ...baseArgs,
        attachments: [new File(['data'], 'report.pdf', { type: 'application/pdf' })],
        expectedReplyDuration: 'tomorrow',
      });

      const formData = mockedPost.mock.calls[0][1] as FormData;
      expect(formData.get('expectedReplyAt')).toBe(melbourneTomorrow8am);
    });

    it('sends no instant when there is no follow-up', async () => {
      await postComposedEmail(baseArgs);

      expect((mockedPost.mock.calls[0][1] as Record<string, unknown>).expectedReplyAt).toBeUndefined();
    });
  });
});
