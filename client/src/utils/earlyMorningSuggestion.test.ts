import {
  buildEarlyMorningScheduleSuggestion,
  isBeforeEarlyMorningCutoff,
} from './earlyMorningSuggestion';

const translate = (key: string, options?: Record<string, unknown>): string =>
  options ? `${key} ${JSON.stringify(options)}` : key;

describe('isBeforeEarlyMorningCutoff', () => {
  it('is true early in the morning (06:00)', () => {
    expect(isBeforeEarlyMorningCutoff(new Date(2026, 6, 20, 6, 0))).toBe(true);
  });

  it('is true just before the cutoff (08:29)', () => {
    expect(isBeforeEarlyMorningCutoff(new Date(2026, 6, 20, 8, 29))).toBe(true);
  });

  it('is true at midnight (00:00)', () => {
    expect(isBeforeEarlyMorningCutoff(new Date(2026, 6, 20, 0, 0))).toBe(true);
  });

  it('is false at the cutoff (08:30)', () => {
    expect(isBeforeEarlyMorningCutoff(new Date(2026, 6, 20, 8, 30))).toBe(false);
  });

  it('is false later in the day (09:00)', () => {
    expect(isBeforeEarlyMorningCutoff(new Date(2026, 6, 20, 9, 0))).toBe(false);
  });
});

describe('buildEarlyMorningScheduleSuggestion', () => {
  it('returns a suggestion when it is before 08:30 (06:00)', () => {
    const now = new Date(2026, 6, 20, 6, 0);
    const suggestion = buildEarlyMorningScheduleSuggestion(now, translate);
    expect(suggestion).not.toBeNull();
    expect(suggestion?.label).toContain('compose.scheduleTodayEarlyTitle');
    expect(suggestion?.description).toBe('compose.scheduleTodayEarlySubtitle');
  });

  it('resolves to today at 08:30 local time', () => {
    const now = new Date(2026, 6, 20, 6, 15);
    const suggestion = buildEarlyMorningScheduleSuggestion(now, translate);
    const resolved = new Date(suggestion!.value);
    expect(resolved.getFullYear()).toBe(2026);
    expect(resolved.getMonth()).toBe(6);
    expect(resolved.getDate()).toBe(20);
    expect(resolved.getHours()).toBe(8);
    expect(resolved.getMinutes()).toBe(30);
  });

  it('returns null after the cutoff (09:00)', () => {
    const now = new Date(2026, 6, 20, 9, 0);
    expect(buildEarlyMorningScheduleSuggestion(now, translate)).toBeNull();
  });
});
