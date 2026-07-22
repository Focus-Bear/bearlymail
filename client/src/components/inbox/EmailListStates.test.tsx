import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import {
  HIGH_PRIORITY_THRESHOLD,
  MEDIUM_PRIORITY_THRESHOLD,
  VERY_HIGH_PRIORITY_THRESHOLD,
} from 'hooks/useInboxFilters';

import { EmailListStates } from './EmailListStates';

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

vi.mock('components/inbox/states', () => ({
  AllCaughtUpState: () => <div data-testid="all-caught-up-state">AllCaughtUp</div>,
  EmptyState: ({ mode }: { mode: string }) => <div data-testid="empty-state">{mode}</div>,
  ErrorState: ({ error }: { error: string }) => <div data-testid="error-state">{error}</div>,
  FilteredEmptyState: ({
    currentTierLabel,
    lowerPriorityCount,
    onShowAll,
  }: {
    currentTierLabel: string;
    lowerPriorityCount: number;
    onShowAll?: () => void;
  }) => (
    <div data-testid="filtered-empty-state">
      <span data-testid="filtered-tier-label">{currentTierLabel}</span>
      <span data-testid="filtered-lower-count">{lowerPriorityCount}</span>
      {onShowAll && (
        <button data-testid="show-all-btn" onClick={onShowAll}>
          Show all
        </button>
      )}
    </div>
  ),
  LoadingState: () => <div data-testid="loading-state">Loading</div>,
  ProgressiveUnlockPrompt: ({
    actionCount,
    followUpCount,
    onPeek,
    onLater,
  }: {
    actionCount: number;
    followUpCount: number;
    onPeek: () => void;
    onLater: () => void;
  }) => (
    <div data-testid="guided-peek-prompt">
      <span data-testid="peek-action-count">{actionCount}</span>
      <span data-testid="peek-followup-count">{followUpCount}</span>
      <button data-testid="peek-btn" onClick={onPeek}>
        Peek
      </button>
      <button data-testid="later-btn" onClick={onLater}>
        Later
      </button>
    </div>
  ),
}));

const baseProps = {
  loading: false,
  hasInitiallyLoaded: true,
  loadingModeSwitch: false,
  decrypting: false,
  fetchError: null,
  emailsEmpty: false,
  mode: 'triage' as const,
  onRetry: vi.fn(),
};

describe('EmailListStates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('loading states', () => {
    it('renders LoadingState when loading', () => {
      render(<EmailListStates {...baseProps} loading />);
      expect(screen.getByTestId('loading-state')).toBeTruthy();
    });

    it('renders LoadingState when not yet initially loaded', () => {
      render(<EmailListStates {...baseProps} hasInitiallyLoaded={false} />);
      expect(screen.getByTestId('loading-state')).toBeTruthy();
    });

    it('renders LoadingState when switching modes', () => {
      render(<EmailListStates {...baseProps} loadingModeSwitch />);
      expect(screen.getByTestId('loading-state')).toBeTruthy();
    });
  });

  describe('error state', () => {
    it('renders ErrorState when fetchError is set', () => {
      render(<EmailListStates {...baseProps} fetchError="Fetch failed" />);
      expect(screen.getByTestId('error-state')).toBeTruthy();
    });
  });

  describe('guided peek prompt — High-and-above cleared', () => {
    it('renders the peek prompt when the guided High view is empty and lower emails exist', () => {
      render(
        <EmailListStates
          {...baseProps}
          emailsEmpty
          minPriority={HIGH_PRIORITY_THRESHOLD}
          maxPriority={null}
          priorityCounts={{ veryHigh: 0, high: 0, medium: 7, low: 2, veryLow: 0 }}
          existingActionCount={3}
          existingFollowUpCount={1}
          onUnlockPriorityTier={vi.fn()}
          onDismissUnlockPrompt={vi.fn()}
        />
      );
      expect(screen.getByTestId('guided-peek-prompt')).toBeTruthy();
      expect(screen.getByTestId('peek-action-count').textContent).toBe('3');
      expect(screen.getByTestId('peek-followup-count').textContent).toBe('1');
    });

    it('peeking calls onUnlockPriorityTier(null, HIGH_PRIORITY_THRESHOLD)', () => {
      const onUnlockPriorityTier = vi.fn();
      render(
        <EmailListStates
          {...baseProps}
          emailsEmpty
          minPriority={HIGH_PRIORITY_THRESHOLD}
          maxPriority={null}
          priorityCounts={{ veryHigh: 0, high: 0, medium: 7, low: 2, veryLow: 0 }}
          onUnlockPriorityTier={onUnlockPriorityTier}
          onDismissUnlockPrompt={vi.fn()}
        />
      );
      fireEvent.click(screen.getByTestId('peek-btn'));
      expect(onUnlockPriorityTier).toHaveBeenCalledWith(null, HIGH_PRIORITY_THRESHOLD);
    });

    it('dismissing the prompt shows FilteredEmptyState when lower emails still exist', () => {
      const onDismissUnlockPrompt = vi.fn();
      render(
        <EmailListStates
          {...baseProps}
          emailsEmpty
          minPriority={HIGH_PRIORITY_THRESHOLD}
          maxPriority={null}
          priorityCounts={{ veryHigh: 0, high: 0, medium: 7, low: 2, veryLow: 0 }}
          onUnlockPriorityTier={vi.fn()}
          onDismissUnlockPrompt={onDismissUnlockPrompt}
        />
      );
      fireEvent.click(screen.getByTestId('later-btn'));
      expect(onDismissUnlockPrompt).toHaveBeenCalled();
      expect(screen.queryByTestId('guided-peek-prompt')).toBeNull();
      expect(screen.getByTestId('filtered-empty-state')).toBeTruthy();
    });

    it('shows AllCaughtUpState (not the peek prompt) when the High view is empty and no lower emails exist', () => {
      render(
        <EmailListStates
          {...baseProps}
          emailsEmpty
          minPriority={HIGH_PRIORITY_THRESHOLD}
          maxPriority={null}
          priorityCounts={{ veryHigh: 0, high: 0, medium: 0, low: 0, veryLow: 0 }}
          onUnlockPriorityTier={vi.fn()}
          onDismissUnlockPrompt={vi.fn()}
        />
      );
      expect(screen.queryByTestId('guided-peek-prompt')).toBeNull();
      expect(screen.getByTestId('all-caught-up-state')).toBeTruthy();
    });
  });

  describe('manual bounded buckets do NOT get the peek prompt', () => {
    it('shows FilteredEmptyState for a manual Medium bucket with lower emails', () => {
      render(
        <EmailListStates
          {...baseProps}
          emailsEmpty
          minPriority={MEDIUM_PRIORITY_THRESHOLD}
          maxPriority={HIGH_PRIORITY_THRESHOLD}
          priorityCounts={{ veryHigh: 0, high: 0, medium: 0, low: 3, veryLow: 0 }}
          onUnlockPriorityTier={vi.fn()}
          onDismissUnlockPrompt={vi.fn()}
        />
      );
      expect(screen.queryByTestId('guided-peek-prompt')).toBeNull();
      expect(screen.getByTestId('filtered-empty-state')).toBeTruthy();
    });

    it('does not show the peek prompt for a manual Very-High (bounded floor) view', () => {
      render(
        <EmailListStates
          {...baseProps}
          emailsEmpty
          minPriority={VERY_HIGH_PRIORITY_THRESHOLD}
          maxPriority={null}
          priorityCounts={{ veryHigh: 0, high: 5, medium: 2, low: 0, veryLow: 0 }}
          onUnlockPriorityTier={vi.fn()}
          onDismissUnlockPrompt={vi.fn()}
        />
      );
      // min=50 is not the guided High floor (30) → FilteredEmptyState, no peek prompt.
      expect(screen.queryByTestId('guided-peek-prompt')).toBeNull();
      expect(screen.getByTestId('filtered-empty-state')).toBeTruthy();
    });
  });

  describe('no filter / loading', () => {
    it('renders EmptyState when no priority filter is active', () => {
      render(
        <EmailListStates
          {...baseProps}
          emailsEmpty
          minPriority={null}
          maxPriority={null}
          priorityCounts={{ veryHigh: 0, high: 0, medium: 5, low: 2, veryLow: 0 }}
          onUnlockPriorityTier={vi.fn()}
          onDismissUnlockPrompt={vi.fn()}
        />
      );
      expect(screen.getByTestId('empty-state')).toBeTruthy();
      expect(screen.queryByTestId('guided-peek-prompt')).toBeNull();
    });

    it('renders EmptyState when priorityCounts is still loading (null)', () => {
      render(
        <EmailListStates
          {...baseProps}
          emailsEmpty
          minPriority={HIGH_PRIORITY_THRESHOLD}
          maxPriority={null}
          priorityCounts={null}
          onUnlockPriorityTier={vi.fn()}
          onDismissUnlockPrompt={vi.fn()}
        />
      );
      expect(screen.getByTestId('empty-state')).toBeTruthy();
      expect(screen.queryByTestId('guided-peek-prompt')).toBeNull();
    });
  });

  describe('non-empty inbox', () => {
    it('renders nothing when emails are not empty', () => {
      render(<EmailListStates {...baseProps} emailsEmpty={false} />);
      expect(screen.queryByTestId('loading-state')).toBeNull();
      expect(screen.queryByTestId('error-state')).toBeNull();
      expect(screen.queryByTestId('empty-state')).toBeNull();
      expect(screen.queryByTestId('guided-peek-prompt')).toBeNull();
    });
  });

  describe('FilteredEmptyState — onClearFilters wiring', () => {
    it('calls onClearFilters when "Show all" is clicked after dismiss', () => {
      const onClearFilters = vi.fn();
      render(
        <EmailListStates
          {...baseProps}
          emailsEmpty
          minPriority={HIGH_PRIORITY_THRESHOLD}
          maxPriority={null}
          priorityCounts={{ veryHigh: 0, high: 0, medium: 3, low: 2, veryLow: 0 }}
          onUnlockPriorityTier={vi.fn()}
          onDismissUnlockPrompt={vi.fn()}
          onClearFilters={onClearFilters}
        />
      );
      fireEvent.click(screen.getByTestId('later-btn'));
      expect(screen.getByTestId('show-all-btn')).toBeTruthy();
      fireEvent.click(screen.getByTestId('show-all-btn'));
      expect(onClearFilters).toHaveBeenCalledTimes(1);
    });

    it('shows the total lower-priority count after dismiss (medium=3, low=2, veryLow=1 => 6)', () => {
      render(
        <EmailListStates
          {...baseProps}
          emailsEmpty
          minPriority={HIGH_PRIORITY_THRESHOLD}
          maxPriority={null}
          priorityCounts={{ veryHigh: 0, high: 0, medium: 3, low: 2, veryLow: 1 }}
          onUnlockPriorityTier={vi.fn()}
          onDismissUnlockPrompt={vi.fn()}
        />
      );
      fireEvent.click(screen.getByTestId('later-btn'));
      expect(screen.getByTestId('filtered-lower-count').textContent).toBe('6');
    });
  });
});
