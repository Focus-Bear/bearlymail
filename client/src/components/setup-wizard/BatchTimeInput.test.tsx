import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { BatchTimeInput, buildTimeValue, parseTimeParts } from './BatchTimeInput';

describe('parseTimeParts / buildTimeValue', () => {
  it('parses a 24-hour string into 12-hour display parts', () => {
    expect(parseTimeParts('15:30')).toEqual({ hour12: 3, minute: 30, meridiem: 'PM' });
    expect(parseTimeParts('11:00')).toEqual({ hour12: 11, minute: 0, meridiem: 'AM' });
  });

  it('maps midnight and noon correctly', () => {
    expect(parseTimeParts('00:00')).toEqual({ hour12: 12, minute: 0, meridiem: 'AM' });
    expect(parseTimeParts('12:00')).toEqual({ hour12: 12, minute: 0, meridiem: 'PM' });
  });

  it('falls back to 12:00 AM for invalid input', () => {
    expect(parseTimeParts('')).toEqual({ hour12: 12, minute: 0, meridiem: 'AM' });
    expect(parseTimeParts('nonsense')).toEqual({ hour12: 12, minute: 0, meridiem: 'AM' });
  });

  it('round-trips back to a zero-padded 24-hour string', () => {
    expect(buildTimeValue({ hour12: 3, minute: 5, meridiem: 'PM' })).toBe('15:05');
    expect(buildTimeValue({ hour12: 12, minute: 0, meridiem: 'AM' })).toBe('00:00');
    expect(buildTimeValue({ hour12: 12, minute: 0, meridiem: 'PM' })).toBe('12:00');
  });
});

describe('BatchTimeInput', () => {
  const renderInput = (value: string, onChange = vi.fn()) => {
    render(
      <BatchTimeInput
        value={value}
        onChange={onChange}
        hourLabel="Morning batch — Hour"
        minuteLabel="Morning batch — Minutes"
        meridiemLabel="Morning batch — AM or PM"
      />
    );
    return onChange;
  };

  it('exposes a visible AM/PM dropdown reflecting the value', () => {
    renderInput('15:00');
    const meridiem = screen.getByLabelText('Morning batch — AM or PM') as HTMLSelectElement;
    // A real <select> (has options), not a native time input — clickable in every browser.
    expect(meridiem.tagName).toBe('SELECT');
    expect(meridiem.value).toBe('PM');
  });

  it('emits an updated 24-hour value when AM/PM is switched with the dropdown', () => {
    const onChange = renderInput('15:00');
    fireEvent.change(screen.getByLabelText('Morning batch — AM or PM'), { target: { value: 'AM' } });
    expect(onChange).toHaveBeenCalledWith('03:00');
  });

  it('emits an updated value when the hour dropdown changes', () => {
    const onChange = renderInput('15:00');
    fireEvent.change(screen.getByLabelText('Morning batch — Hour'), { target: { value: '9' } });
    expect(onChange).toHaveBeenCalledWith('21:00');
  });

  it('keeps an off-step minute selectable rather than rounding it away', () => {
    renderInput('11:07');
    const minute = screen.getByLabelText('Morning batch — Minutes') as HTMLSelectElement;
    expect(minute.value).toBe('7');
    expect(screen.getByRole('option', { name: '07' })).toBeInTheDocument();
  });
});
