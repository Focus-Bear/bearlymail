import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { FilteredEmptyState } from './FilteredEmptyState';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts) {
        return `${key}:${JSON.stringify(opts)}`;
      }
      return key;
    },
  }),
}));

vi.mock('theme/theme', () => ({
  theme: {
    spacing: { sm: '8px', md: '12px', lg: '16px', xl: '20px', '3xl': '32px' },
    colors: {
      background: { paper: '#fff' },
      text: { primary: '#000', secondary: '#666' },
      accent: { success: '#4caf50' },
      common: { white: '#fff' },
      border: { medium: '#ccc' },
    },
    borderRadius: { md: '4px', xl: '8px' },
    typography: {
      fontWeight: { semibold: 600 },
      fontSize: { sm: '14px' },
    },
  },
}));

describe('FilteredEmptyState', () => {
  it('renders the tier label and lower priority count', () => {
    render(<FilteredEmptyState currentTierLabel="Very High priority" lowerPriorityCount={12} />);
    expect(screen.getByText('inbox.filteredEmpty.noTierEmails:{"tier":"Very High priority"}')).toBeTruthy();
    expect(screen.getByText('inbox.filteredEmpty.hasLowerPriority:{"count":12}')).toBeTruthy();
  });

  it('renders the "Show all emails" button when onShowAll is provided', () => {
    const onShowAll = vi.fn();
    render(<FilteredEmptyState currentTierLabel="High priority" lowerPriorityCount={5} onShowAll={onShowAll} />);
    const btn = screen.getByText('inbox.filteredEmpty.showAll');
    expect(btn).toBeTruthy();
  });

  it('calls onShowAll when the button is clicked', () => {
    const onShowAll = vi.fn();
    render(<FilteredEmptyState currentTierLabel="High priority" lowerPriorityCount={5} onShowAll={onShowAll} />);
    fireEvent.click(screen.getByText('inbox.filteredEmpty.showAll'));
    expect(onShowAll).toHaveBeenCalledTimes(1);
  });

  it('does NOT render the "Show all emails" button when onShowAll is undefined', () => {
    render(<FilteredEmptyState currentTierLabel="Medium priority" lowerPriorityCount={3} />);
    expect(screen.queryByText('inbox.filteredEmpty.showAll')).toBeNull();
  });
});
