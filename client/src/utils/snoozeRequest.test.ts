import { buildSnoozeRequestBody } from './snoozeRequest';

const MELBOURNE_TIME_ZONE = 'Australia/Melbourne';

describe('buildSnoozeRequestBody', () => {
  beforeAll(() => {
    // Node applies a TZ change to Date immediately; this stands in for a
    // browser in Melbourne while the API itself runs in UTC.
    vi.stubEnv('TZ', MELBOURNE_TIME_ZONE);
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  // 10:17am Friday 16 Oct in Melbourne — still Thursday 15 Oct in UTC.
  const melbourneMorning = new Date('2026-10-15T23:17:00.000Z');

  it("resolves 'tomorrow' to 8am tomorrow in the user's timezone", () => {
    expect(buildSnoozeRequestBody('tomorrow', 'en', melbourneMorning)).toEqual({
      duration: 'tomorrow',
      locale: 'en',
      // Saturday 17 Oct, 8am AEDT. A UTC server parsing "tomorrow" itself
      // would pick 2026-10-16T08:00Z — 7pm the same Friday in Melbourne.
      snoozeUntil: '2026-10-16T21:00:00.000Z',
    });
  });

  it('resolves day names in the selected locale', () => {
    expect(buildSnoozeRequestBody('lun', 'es', melbourneMorning).snoozeUntil).toBe(
      // Monday 19 Oct, 8am AEDT.
      '2026-10-18T21:00:00.000Z'
    );
  });

  it('leaves snoozeUntil out when the duration cannot be parsed, so the server falls back', () => {
    expect(buildSnoozeRequestBody('zzz', 'en', melbourneMorning)).toEqual({ duration: 'zzz', locale: 'en' });
  });
});
