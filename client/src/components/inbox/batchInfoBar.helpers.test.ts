import { getLastCheckText, getNextDeliveryText } from './batchInfoBar.helpers';

const translateMock = (key: string, opts?: Record<string, unknown>) => {
  switch (key) {
    case 'inbox.batchInfo.neverChecked':
      return 'Never checked';
    case 'inbox.batchInfo.justNow':
      return 'Just now';
    case 'inbox.batchInfo.oneMinuteAgo':
      return '1 minute ago';
    case 'inbox.batchInfo.minutesAgo':
      return `${opts?.count} minutes ago`;
    case 'inbox.batchInfo.oneHourAgo':
      return '1 hour ago';
    case 'inbox.batchInfo.hoursAgo':
      return `${opts?.count} hours ago`;
    default:
      return key;
  }
};

describe('getNextDeliveryText', () => {
  beforeAll(() => {
    vi.useFakeTimers();
    // fixed reference time: 2026-03-12T12:00:00.000Z
    vi.setSystemTime(new Date('2026-03-12T12:00:00.000Z'));
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it('returns null for null input', () => {
    expect(getNextDeliveryText(null)).toBeNull();
  });

  it('returns null for past date', () => {
    const past = new Date('2026-03-12T11:00:00.000Z');
    expect(getNextDeliveryText(past)).toBeNull();
  });

  it('returns minutes for future < 1h', () => {
    const future = new Date('2026-03-12T12:30:00.000Z'); // 30m
    expect(getNextDeliveryText(future)).toBe('30m');
  });

  it('returns hours for exact hour', () => {
    const future = new Date('2026-03-12T14:00:00.000Z'); // 2h
    expect(getNextDeliveryText(future)).toBe('2h');
  });

  it('returns hours and minutes for non-exact hour', () => {
    // Fixed time: 2026-03-12T12:00:00Z. Future: 2026-03-13T15:45:00Z → 27h 45m
    const future = new Date('2026-03-13T15:45:00.000Z');
    expect(getNextDeliveryText(future)).toBe('27h 45m');
  });
});

describe('getLastCheckText', () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-12T12:00:00.000Z'));
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it('returns never checked for null', () => {
    expect(getLastCheckText(null, translateMock)).toBe('Never checked');
  });

  it('returns just now for <1 minute ago', () => {
    // 20 seconds ago — Math.round(20000/60000) = 0 which is < 1
    const recent = new Date('2026-03-12T11:59:40.000Z');
    expect(getLastCheckText(recent, translateMock)).toBe('Just now');
  });

  it('returns one minute ago for ~1 minute ago', () => {
    const oneMinAgo = new Date('2026-03-12T11:59:00.000Z');
    expect(getLastCheckText(oneMinAgo, translateMock)).toBe('1 minute ago');
  });

  it('returns minutes ago for several minutes', () => {
    const fifteenMinAgo = new Date('2026-03-12T11:45:00.000Z');
    expect(getLastCheckText(fifteenMinAgo, translateMock)).toBe('15 minutes ago');
  });

  it('returns one hour ago for ~1 hour', () => {
    const oneHourAgo = new Date('2026-03-12T11:00:00.000Z');
    expect(getLastCheckText(oneHourAgo, translateMock)).toBe('1 hour ago');
  });

  it('returns hours ago for multiple hours', () => {
    const fourHoursAgo = new Date('2026-03-12T08:00:00.000Z');
    expect(getLastCheckText(fourHoursAgo, translateMock)).toBe('4 hours ago');
  });
});
