/**
 * Unit tests for TimePicker — the natural-language custom time input mirrors the
 * snooze input: typing a human string enables "Set Time" only when it resolves
 * to a valid future date, and submitting passes the parsed Date to onTimeSelect.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { TimePicker } from './TimePicker';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key} ${JSON.stringify(params)}` : key,
    i18n: { language: 'en' },
  }),
}));

const baseProps = {
  selectedTime: null,
  suggestions: [],
  onCancel: vi.fn(),
};

const openCustom = () => {
  fireEvent.click(screen.getByText('compose.customTime'));
};

describe('TimePicker custom human-time input', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps Set Time disabled until the typed text parses to a future date', () => {
    const onTimeSelect = vi.fn();
    render(<TimePicker {...baseProps} onTimeSelect={onTimeSelect} />);
    openCustom();

    const setTime = screen.getByText('compose.setCustomTime');
    expect(setTime).toBeDisabled();

    const input = screen.getByPlaceholderText('compose.customTimePlaceholder');
    fireEvent.change(input, { target: { value: 'in 2 hours' } });

    expect(setTime).not.toBeDisabled();
    expect(screen.getByTestId('schedule-humanized-preview')).toBeInTheDocument();
  });

  it('shows an invalid hint and stays disabled for unparseable text', () => {
    const onTimeSelect = vi.fn();
    render(<TimePicker {...baseProps} onTimeSelect={onTimeSelect} />);
    openCustom();

    const input = screen.getByPlaceholderText('compose.customTimePlaceholder');
    fireEvent.change(input, { target: { value: 'asdfghjkl' } });

    expect(screen.getByText('compose.setCustomTime')).toBeDisabled();
    expect(screen.getByTestId('schedule-invalid-hint')).toHaveTextContent('compose.customTimeInvalid');
  });

  it('submits the parsed future Date via onTimeSelect on Enter', () => {
    const onTimeSelect = vi.fn();
    render(<TimePicker {...baseProps} onTimeSelect={onTimeSelect} />);
    openCustom();

    const input = screen.getByPlaceholderText('compose.customTimePlaceholder');
    fireEvent.change(input, { target: { value: 'in 3 hours' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onTimeSelect).toHaveBeenCalledTimes(1);
    const submitted = onTimeSelect.mock.calls[0][0] as Date;
    expect(submitted).toBeInstanceOf(Date);
    expect(submitted.getTime()).toBeGreaterThan(Date.now());
  });
});
