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
    spacing: { xs: '4px', sm: '8px', md: '12px', lg: '16px', xl: '20px', '3xl': '32px' },
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
      fontSize: { sm: '14px', base: '16px' },
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

  describe('with pre-existing Action/Follow-Up work', () => {
    it('makes "Take action" the prominent primary and the reveal a de-emphasised link', () => {
      const onTakeAction = vi.fn();
      const onShowAll = vi.fn();
      render(
        <FilteredEmptyState
          currentTierLabel="High priority"
          lowerPriorityCount={9}
          hasExistingWork
          onTakeAction={onTakeAction}
          onShowAll={onShowAll}
        />
      );
      // Primary is the shared "Take action 🐎" CTA; the plain "Show all" button is gone.
      expect(screen.getByTestId('filtered-take-action').textContent).toBe('inbox.guidedPeek.takeActionCta');
      expect(screen.queryByTestId('filtered-show-all')).toBeNull();
      // The distract reveal is a de-emphasised underlined link, not a prominent button.
      const link = screen.getByTestId('filtered-distract-link');
      expect(link.textContent).toBe('inbox.filteredEmpty.distractInstead');
      expect(link.style.textDecoration).toBe('underline');
    });

    it('primary "Take action" click calls onTakeAction (navigates to Action tab)', () => {
      const onTakeAction = vi.fn();
      render(
        <FilteredEmptyState
          currentTierLabel="High priority"
          lowerPriorityCount={9}
          hasExistingWork
          onTakeAction={onTakeAction}
          onShowAll={vi.fn()}
        />
      );
      fireEvent.click(screen.getByTestId('filtered-take-action'));
      expect(onTakeAction).toHaveBeenCalledTimes(1);
    });

    it('secondary distract link click triggers the reveal (friction gate)', () => {
      const onShowAll = vi.fn();
      const onTakeAction = vi.fn();
      render(
        <FilteredEmptyState
          currentTierLabel="High priority"
          lowerPriorityCount={9}
          hasExistingWork
          onTakeAction={onTakeAction}
          onShowAll={onShowAll}
        />
      );
      fireEvent.click(screen.getByTestId('filtered-distract-link'));
      expect(onShowAll).toHaveBeenCalledTimes(1);
      expect(onTakeAction).not.toHaveBeenCalled();
    });

    it('falls back to the plain "Show all" button if onTakeAction is missing', () => {
      const onShowAll = vi.fn();
      render(
        <FilteredEmptyState
          currentTierLabel="High priority"
          lowerPriorityCount={9}
          hasExistingWork
          onShowAll={onShowAll}
        />
      );
      expect(screen.getByTestId('filtered-show-all')).toBeTruthy();
      expect(screen.queryByTestId('filtered-take-action')).toBeNull();
    });
  });

  describe('with no pre-existing work', () => {
    it('shows a single plain "Show all emails" button (direct reveal, no take-action)', () => {
      const onShowAll = vi.fn();
      const onTakeAction = vi.fn();
      render(
        <FilteredEmptyState
          currentTierLabel="High priority"
          lowerPriorityCount={9}
          hasExistingWork={false}
          onTakeAction={onTakeAction}
          onShowAll={onShowAll}
        />
      );
      expect(screen.getByTestId('filtered-show-all')).toBeTruthy();
      expect(screen.queryByTestId('filtered-take-action')).toBeNull();
      expect(screen.queryByTestId('filtered-distract-link')).toBeNull();
      fireEvent.click(screen.getByTestId('filtered-show-all'));
      expect(onShowAll).toHaveBeenCalledTimes(1);
      expect(onTakeAction).not.toHaveBeenCalled();
    });
  });
});
