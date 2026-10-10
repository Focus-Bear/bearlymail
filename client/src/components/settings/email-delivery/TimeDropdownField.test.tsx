import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { DEFAULT_DELIVERY_TIME_24H } from './deliveryTimesManager.helpers';
import { TimeDropdownField } from './TimeDropdownField';

const renderField = (value: string, onChange = vi.fn()) => {
  render(<TimeDropdownField value={value} onChange={onChange} timeLabel="Time" meridiemLabel="AM or PM" />);
  return onChange;
};

describe('TimeDropdownField', () => {
  it('exposes a visible AM/PM dropdown (a real select, not a native time input)', () => {
    renderField('15:00');
    const meridiem = screen.getByLabelText('AM or PM') as HTMLSelectElement;
    expect(meridiem.tagName).toBe('SELECT');
    expect(meridiem.value).toBe('PM');
  });

  it('offers the hour:minute in a single dropdown stepping by 30 minutes', () => {
    renderField('15:00');
    const time = screen.getByLabelText('Time') as HTMLSelectElement;
    expect(time.value).toBe('3:00');
    // 30-minute grid: both :00 and :30 exist, but no :15.
    expect(screen.getByRole('option', { name: '3:00' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '3:30' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: '3:15' })).not.toBeInTheDocument();
  });

  it('normalises an empty value up to a concrete default so Add works without keyboard interaction (#297)', () => {
    // With the old native <input type="time">, an untouched field stayed empty
    // and the parent Add button never enabled. The dropdown field emits a real
    // value immediately instead.
    const onChange = renderField('');
    expect(onChange).toHaveBeenCalledWith(DEFAULT_DELIVERY_TIME_24H);
  });

  it('switches AM/PM by mouse/change and emits the 24-hour value', () => {
    const onChange = renderField('15:00');
    fireEvent.change(screen.getByLabelText('AM or PM'), { target: { value: 'AM' } });
    expect(onChange).toHaveBeenLastCalledWith('03:00');
  });

  it('emits an updated value when the merged time dropdown changes, keeping the meridiem', () => {
    const onChange = renderField('15:00'); // 3:00 PM
    fireEvent.change(screen.getByLabelText('Time'), { target: { value: '9:30' } });
    expect(onChange).toHaveBeenLastCalledWith('21:30'); // 9:30 PM
  });
});
