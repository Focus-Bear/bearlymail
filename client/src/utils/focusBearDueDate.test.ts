import { DUE_DATE_STATUS, localDayKey, resolveFocusBearDueDate } from './focusBearDueDate';

// Friday 13 November 2026, mid-morning local time.
const NOW = new Date(2026, 10, 13, 10, 30);

function dayFor(input: string, locale = 'en'): string | null {
  const resolved = resolveFocusBearDueDate(input, NOW, locale);
  return resolved.status === DUE_DATE_STATUS.VALID ? resolved.day : null;
}

describe('resolveFocusBearDueDate', () => {
  it.each([
    ['today', '2026-11-13'],
    ['tomorrow', '2026-11-14'],
    ['tom', '2026-11-14'],
    ['2d', '2026-11-15'],
    ['1w', '2026-11-20'],
    ['mon', '2026-11-16'],
    ['fri', '2026-11-20'],
    ['30th', '2026-11-30'],
    ['next week', '2026-11-20'],
    ['2h', '2026-11-13'],
  ])('reads %s as %s', (input, day) => {
    expect(dayFor(input)).toBe(day);
  });

  it('reads Spanish the way the snooze box does', () => {
    expect(dayFor('mañana', 'es')).toBe('2026-11-14');
    expect(dayFor('vie', 'es')).toBe('2026-11-20');
  });

  it('is empty until something is typed', () => {
    expect(resolveFocusBearDueDate('  ', NOW).status).toBe(DUE_DATE_STATUS.EMPTY);
  });

  it('refuses what it cannot read', () => {
    expect(resolveFocusBearDueDate('whenever', NOW).status).toBe(DUE_DATE_STATUS.INVALID);
  });

  it('refuses a day that has passed', () => {
    expect(resolveFocusBearDueDate('yesterday', NOW).status).toBe(DUE_DATE_STATUS.PAST);
  });
});

describe('localDayKey', () => {
  it('writes the local calendar day, zero-padded', () => {
    expect(localDayKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
});
