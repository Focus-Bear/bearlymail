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
        timeLabel="Morning batch — Time"
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

  it('offers the hour:minute in a single dropdown stepping by 30 minutes', () => {
    renderInput('15:00');
    const time = screen.getByLabelText('Morning batch — Time') as HTMLSelectElement;
    expect(time.value).toBe('3:00');
    expect(screen.getByRole('option', { name: '3:30' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: '3:15' })).not.toBeInTheDocument();
  });

  it('emits an updated 24-hour value when AM/PM is switched with the dropdown', () => {
    const onChange = renderInput('15:00');
    fireEvent.change(screen.getByLabelText('Morning batch — AM or PM'), { target: { value: 'AM' } });
    expect(onChange).toHaveBeenCalledWith('03:00');
  });

  it('emits an updated value when the merged time dropdown changes, keeping the meridiem', () => {
    const onChange = renderInput('15:00'); // 3:00 PM
    fireEvent.change(screen.getByLabelText('Morning batch — Time'), { target: { value: '9:30' } });
    expect(onChange).toHaveBeenCalledWith('21:30'); // 9:30 PM
  });

  it('keeps an off-step time selectable rather than dropping it', () => {
    renderInput('11:07'); // 11:07 AM — not on the half-hour grid
    const time = screen.getByLabelText('Morning batch — Time') as HTMLSelectElement;
    expect(time.value).toBe('11:07');
    expect(screen.getByRole('option', { name: '11:07' })).toBeInTheDocument();
  });
});
