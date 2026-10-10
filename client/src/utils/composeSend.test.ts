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

    it('appends neither field when the follow-up was cleared', async () => {
      await postComposedEmail({ ...baseArgs, attachments: [attachment()] });

      const formData = mockedPost.mock.calls[0][1] as FormData;
      expect(formData.get('expectedReplyDuration')).toBeNull();
      expect(formData.get('locale')).toBeNull();
    });
  });
});
