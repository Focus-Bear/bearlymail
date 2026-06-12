/**
 * Tests for the PriorityBadge processing → calculated transition.
 *
 * While isProcessingPriority is true the badge shows a spinner. When the flag
 * flips to false while mounted, a brief ✅ confirmation must appear next to the
 * resolved priority label, then disappear after PRIORITY_CALCULATED_FLASH_MS.
 */
import React from 'react';
import { act, render, screen } from '@testing-library/react';

import { PRIORITY_CALCULATED_FLASH_MS } from 'constants/numbers';

import { PriorityBadge } from './PriorityBadge';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const defaultProps = {
  priorityLabel: 'High',
  priorityColor: '#aa0000',
  priorityBg: '#ffeeee',
  priorityScore: 42,
};

describe('PriorityBadge', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the calculating spinner while isProcessingPriority is true', () => {
    render(<PriorityBadge {...defaultProps} isProcessingPriority />);

    expect(screen.getByText('email.calculating')).toBeInTheDocument();
    expect(screen.queryByText('High (42)')).not.toBeInTheDocument();
  });

  it('shows the priority label without a checkmark when never processing', () => {
    render(<PriorityBadge {...defaultProps} isProcessingPriority={false} />);

    expect(screen.getByText('High (42)')).toBeInTheDocument();
    expect(screen.queryByLabelText('email.priorityCalculated')).not.toBeInTheDocument();
  });

  it('shows a ✅ confirmation when processing resolves, then hides it after the flash window', () => {
    const { rerender } = render(<PriorityBadge {...defaultProps} isProcessingPriority />);

    rerender(<PriorityBadge {...defaultProps} isProcessingPriority={false} />);

    // Spinner replaced by the resolved label plus the ✅ confirmation
    expect(screen.queryByText('email.calculating')).not.toBeInTheDocument();
    expect(screen.getByText('High (42)')).toBeInTheDocument();
    expect(screen.getByLabelText('email.priorityCalculated')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(PRIORITY_CALCULATED_FLASH_MS + 1);
    });

    // Confirmation gone, label remains
    expect(screen.queryByLabelText('email.priorityCalculated')).not.toBeInTheDocument();
    expect(screen.getByText('High (42)')).toBeInTheDocument();
  });

  it('restarts the spinner (and later re-flashes) if processing starts again', () => {
    const { rerender } = render(<PriorityBadge {...defaultProps} isProcessingPriority />);
    rerender(<PriorityBadge {...defaultProps} isProcessingPriority={false} />);
    act(() => {
      vi.advanceTimersByTime(PRIORITY_CALCULATED_FLASH_MS + 1);
    });

    // Processing starts again (e.g. user requested a re-analysis)
    rerender(<PriorityBadge {...defaultProps} isProcessingPriority />);
    expect(screen.getByText('email.calculating')).toBeInTheDocument();

    rerender(<PriorityBadge {...defaultProps} isProcessingPriority={false} />);
    expect(screen.getByLabelText('email.priorityCalculated')).toBeInTheDocument();
  });
});
