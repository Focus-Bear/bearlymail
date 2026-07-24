import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { SchedulePopup } from './SchedulePopup';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      if (params) {
        return `${key} ${JSON.stringify(params)}`;
      }
      return key;
    },
    i18n: { language: 'en' },
  }),
}));

describe('SchedulePopup', () => {
  const defaultProps = {
    onSelectSuggestion: vi.fn(),
    onPickCustom: vi.fn(),
    onClose: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Fake only Date so the early-morning window is deterministic without
    // stalling React's scheduler / testing-library timers.
    vi.useFakeTimers({ toFake: ['Date'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the "Today 8:30" option first when before the early-morning cutoff', () => {
    // 06:15 local — inside the midnight–08:30 window.
    vi.setSystemTime(new Date('2026-03-09T06:15:00'));

    render(<SchedulePopup {...defaultProps} />);

    // Mocked t() echoes the key, so the early-morning option surfaces as its key.
    expect(screen.getByText(/emailDetail\.schedulePopup\.todayEarly/)).toBeInTheDocument();
  });

  it('does not render the "Today 8:30" option after the cutoff', () => {
    vi.setSystemTime(new Date('2026-03-09T09:00:00')); // 09:00, past 08:30

    render(<SchedulePopup {...defaultProps} />);

    expect(screen.queryByText(/emailDetail\.schedulePopup\.todayEarly/)).not.toBeInTheDocument();
  });

  it('calls onPickCustom when "Pick date & time..." is clicked', () => {
    vi.setSystemTime(new Date('2026-03-09T09:00:00'));

    render(<SchedulePopup {...defaultProps} />);
    fireEvent.click(screen.getByText('emailDetail.schedulePopup.pickDateTime'));

    expect(defaultProps.onPickCustom).toHaveBeenCalledTimes(1);
  });
});
