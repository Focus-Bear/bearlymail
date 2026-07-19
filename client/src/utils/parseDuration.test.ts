import { humanizeDuration, parseDurationToDate } from './parseDuration';

describe('parseDurationToDate', () => {
  // Wed 2026-05-27, 10:00 local time
  const now = new Date(2026, 4, 27, 10, 0, 0);

  it('returns null for blank input', () => {
    expect(parseDurationToDate('', now)).toBeNull();
    expect(parseDurationToDate('   ', now)).toBeNull();
  });

  it('parses relative hour durations', () => {
    expect(parseDurationToDate('48h', now)).toEqual(new Date(2026, 4, 29, 10, 0, 0));
  });

  it('parses relative day durations', () => {
    expect(parseDurationToDate('3d', now)).toEqual(new Date(2026, 4, 30, 10, 0, 0));
  });

  it('parses relative week durations', () => {
    expect(parseDurationToDate('2w', now)).toEqual(new Date(2026, 5, 10, 10, 0, 0));
  });

  it('parses minute durations regardless of count', () => {
    expect(parseDurationToDate('90m', now)).toEqual(new Date(2026, 4, 27, 11, 30, 0));
    expect(parseDurationToDate('13m', now)).toEqual(new Date(2026, 4, 27, 10, 13, 0));
    expect(parseDurationToDate('3m', now)).toEqual(new Date(2026, 4, 27, 10, 3, 0));
    expect(parseDurationToDate('12m', now)).toEqual(new Date(2026, 4, 27, 10, 12, 0));
  });

  it('always treats "Nmo" as months regardless of count', () => {
    expect(parseDurationToDate('3mo', now)).toEqual(new Date(2026, 7, 27, 10, 0, 0));
    expect(parseDurationToDate('18mo', now)).toEqual(new Date(2027, 10, 27, 10, 0, 0));
  });

  it('keeps "min" as minutes even at small counts', () => {
    expect(parseDurationToDate('3min', now)).toEqual(new Date(2026, 4, 27, 10, 3, 0));
  });

  it('parses bare day names to the next occurrence at 9am', () => {
    // now is Wednesday → next "mon" is 2026-06-01 at 09:00
    expect(parseDurationToDate('mon', now)).toEqual(new Date(2026, 5, 1, 9, 0, 0));
  });

  it('parses "tom" shorthand as tomorrow (chrono keeps the time of day)', () => {
    // now is Wed 10:00 → "tom" expands to "tomorrow" → Thu 2026-05-28 at 10:00.
    // Without the alias chrono returns null and the snooze falls back to +1h.
    expect(parseDurationToDate('tom', now)).toEqual(new Date(2026, 4, 28, 10, 0, 0));
  });

  it('returns null for unparseable input', () => {
    expect(parseDurationToDate('asdf qwerty', now)).toBeNull();
  });
});

describe('parseDurationToDate (Spanish locale)', () => {
  // Wed 2026-05-27, 10:00 local time
  const now = new Date(2026, 4, 27, 10, 0, 0);

  it('parses Spanish day names', () => {
    // "lun" (Monday) → next Monday 2026-06-01 at 09:00
    expect(parseDurationToDate('lun', now, 'es')).toEqual(new Date(2026, 5, 1, 9, 0, 0));
  });

  it('parses accented Spanish day names', () => {
    // "mié" (Wednesday); now is Wednesday → next Wednesday 2026-06-03 at 09:00
    expect(parseDurationToDate('mié', now, 'es')).toEqual(new Date(2026, 5, 3, 9, 0, 0));
  });

  it('parses Spanish natural language via chrono', () => {
    const result = parseDurationToDate('próximo lunes', now, 'es');
    expect(result).not.toBeNull();
    expect(result?.getDay()).toBe(1); // Monday
    expect(result?.getTime()).toBeGreaterThan(now.getTime());
  });

  it('still parses locale-neutral relative durations under es', () => {
    expect(parseDurationToDate('48h', now, 'es')).toEqual(new Date(2026, 4, 29, 10, 0, 0));
  });

  it('does not treat English day names as Spanish ones', () => {
    // "mar" is Tuesday in Spanish but should not parse as a day under English.
    expect(parseDurationToDate('mar', now, 'en')).toBeNull();
    expect(parseDurationToDate('mar', now, 'es')).toEqual(new Date(2026, 5, 2, 9, 0, 0));
  });
});

describe('humanizeDuration (English)', () => {
  const now = new Date(2026, 4, 27, 10, 0, 0);

  it('returns null for blank input', () => {
    expect(humanizeDuration('', 'en', now)).toBeNull();
  });

  it('humanises a same-day time', () => {
    expect(humanizeDuration('2h', 'en', now)).toEqual({
      i18nKey: 'emailDetail.expectedReply.previewToday',
      values: { time: '12pm' },
    });
  });

  it('humanises a next-day time', () => {
    expect(humanizeDuration('1d', 'en', now)).toEqual({
      i18nKey: 'emailDetail.expectedReply.previewTomorrow',
      values: { time: '10am' },
    });
  });

  it('humanises a future date with weekday, ordinal day and month', () => {
    expect(humanizeDuration('3d', 'en', now)).toEqual({
      i18nKey: 'emailDetail.expectedReply.previewDate',
      values: { date: 'Sat 30th May', time: '10am' },
    });
  });

  it('includes minutes when not on the hour', () => {
    expect(humanizeDuration('90m', 'en', now)).toEqual({
      i18nKey: 'emailDetail.expectedReply.previewToday',
      values: { time: '11:30am' },
    });
  });

  it('defaults to English when no locale is given', () => {
    expect(humanizeDuration('2h', undefined, now)).toEqual({
      i18nKey: 'emailDetail.expectedReply.previewToday',
      values: { time: '12pm' },
    });
  });

  it('uses the caller-supplied preview key set', () => {
    const keys = {
      today: 'emailActions.snoozePreviewToday',
      tomorrow: 'emailActions.snoozePreviewTomorrow',
      date: 'emailActions.snoozePreviewDate',
    };
    expect(humanizeDuration('1d', 'en', now, keys)).toEqual({
      i18nKey: 'emailActions.snoozePreviewTomorrow',
      values: { time: '10am' },
    });
  });
});

describe('humanizeDuration (Spanish)', () => {
  const now = new Date(2026, 4, 27, 10, 0, 0);

  it('uses a 24-hour time and localized date for es', () => {
    const result = humanizeDuration('3d', 'es', now);
    expect(result?.i18nKey).toBe('emailDetail.expectedReply.previewDate');
    // Spanish formats time as 24-hour "10:00" and the date without English ordinals.
    expect(result?.values.time).toBe('10:00');
    expect(result?.values.date).not.toMatch(/th|Sat/);
    expect(result?.values.date).toContain('30');
  });
});
