import { MAX_TASK_DURATION_MINUTES, parseTaskDurationMinutes, splitIntoHoursAndMinutes } from './taskDuration';

describe('parseTaskDurationMinutes', () => {
  it.each([
    ['30m', 30],
    ['45', 45],
    ['30 min', 30],
    ['20 minutes', 20],
    ['1h', 60],
    ['2 hours', 120],
    ['1hr', 60],
    ['1.5h', 90],
    ['1,5h', 90],
    ['1h30', 90],
    ['1h 30m', 90],
    ['1 hour 15 minutes', 75],
    ['1:30', 90],
    ['  2H  ', 120],
    ['2 horas', 120],
    ['30 minutos', 30],
  ])('reads %s as %i minutes', (input, minutes) => {
    expect(parseTaskDurationMinutes(input)).toBe(minutes);
  });

  it.each(['', '   ', 'soon', '2d', '1w', '0', '0h', 'h', '1:75', '-5m'])('reads %j as no length', input => {
    expect(parseTaskDurationMinutes(input)).toBeNull();
  });

  it('reads a length longer than Focus Bear takes, leaving the refusal to the caller', () => {
    expect(parseTaskDurationMinutes('25h')).toBeGreaterThan(MAX_TASK_DURATION_MINUTES);
  });
});

describe('splitIntoHoursAndMinutes', () => {
  it('splits into whole hours and the minutes left over', () => {
    expect(splitIntoHoursAndMinutes(90)).toEqual({ hours: 1, minutes: 30 });
    expect(splitIntoHoursAndMinutes(45)).toEqual({ hours: 0, minutes: 45 });
    expect(splitIntoHoursAndMinutes(120)).toEqual({ hours: 2, minutes: 0 });
  });
});
