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
    onTakeAction,
    onPeek,
  }: {
    actionCount: number;
    followUpCount: number;
    onTakeAction: () => void;
    onPeek: () => void;
  }) => (
    <div data-testid="guided-peek-prompt">
      <span data-testid="peek-action-count">{actionCount}</span>
      <span data-testid="peek-followup-count">{followUpCount}</span>
      <button data-testid="take-action-btn" onClick={onTakeAction}>
        Take action
      </button>
      <button data-testid="peek-btn" onClick={onPeek}>
        Peek
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
    it('renders the prompt with waiting-work counts when the guided High view is empty and lower emails exist', () => {
      render(
        <EmailListStates
          {...baseProps}
          emailsEmpty
          minPriority={HIGH_PRIORITY_THRESHOLD}
          maxPriority={null}
          priorityCounts={{ veryHigh: 0, high: 0, medium: 7, low: 2, veryLow: 0 }}
          existingActionCount={3}
          existingFollowUpCount={1}
          onTakeAction={vi.fn()}
          onUnlockPriorityTier={vi.fn()}
        />
      );
      expect(screen.getByTestId('guided-peek-prompt')).toBeTruthy();
      expect(screen.getByTestId('peek-action-count').textContent).toBe('3');
      expect(screen.getByTestId('peek-followup-count').textContent).toBe('1');
    });

    it('primary "Take action" calls onTakeAction (navigates to the Action tab)', () => {
      const onTakeAction = vi.fn();
      render(
        <EmailListStates
          {...baseProps}
          emailsEmpty
          minPriority={HIGH_PRIORITY_THRESHOLD}
          maxPriority={null}
          priorityCounts={{ veryHigh: 0, high: 0, medium: 7, low: 2, veryLow: 0 }}
          existingActionCount={3}
          onTakeAction={onTakeAction}
          onUnlockPriorityTier={vi.fn()}
        />
      );
      fireEvent.click(screen.getByTestId('take-action-btn'));
      expect(onTakeAction).toHaveBeenCalledTimes(1);
    });

    it('secondary peek calls onUnlockPriorityTier(null, HIGH_PRIORITY_THRESHOLD)', () => {
      const onUnlockPriorityTier = vi.fn();
      render(
        <EmailListStates
          {...baseProps}
          emailsEmpty
          minPriority={HIGH_PRIORITY_THRESHOLD}
          maxPriority={null}
          priorityCounts={{ veryHigh: 0, high: 0, medium: 7, low: 2, veryLow: 0 }}
          existingActionCount={3}
          onTakeAction={vi.fn()}
          onUnlockPriorityTier={onUnlockPriorityTier}
        />
      );
      fireEvent.click(screen.getByTestId('peek-btn'));
      expect(onUnlockPriorityTier).toHaveBeenCalledWith(null, HIGH_PRIORITY_THRESHOLD);
    });

    it('does NOT render the prompt without an onTakeAction handler', () => {
      render(
        <EmailListStates
          {...baseProps}
          emailsEmpty
          minPriority={HIGH_PRIORITY_THRESHOLD}
          maxPriority={null}
          priorityCounts={{ veryHigh: 0, high: 0, medium: 7, low: 2, veryLow: 0 }}
          existingActionCount={3}
          onUnlockPriorityTier={vi.fn()}
        />
      );
      expect(screen.queryByTestId('guided-peek-prompt')).toBeNull();
    });

    it('shows AllCaughtUpState (not the prompt) when the High view is empty and no lower emails exist', () => {
      render(
        <EmailListStates
          {...baseProps}
          emailsEmpty
          minPriority={HIGH_PRIORITY_THRESHOLD}
          maxPriority={null}
          priorityCounts={{ veryHigh: 0, high: 0, medium: 0, low: 0, veryLow: 0 }}
          onTakeAction={vi.fn()}
          onUnlockPriorityTier={vi.fn()}
        />
      );
      expect(screen.queryByTestId('guided-peek-prompt')).toBeNull();
      expect(screen.getByTestId('all-caught-up-state')).toBeTruthy();
    });
  });

  describe('guided peek prompt is Triage-only (never Action / Follow-Up)', () => {
    it.each(['action', 'follow-up'] as const)(
      'never renders the prompt in %s mode even with the guided High view cleared and lower emails',
      mode => {
        render(
          <EmailListStates
            {...baseProps}
            mode={mode}
            emailsEmpty
            minPriority={HIGH_PRIORITY_THRESHOLD}
            maxPriority={null}
            priorityCounts={{ veryHigh: 0, high: 0, medium: 7, low: 2, veryLow: 0 }}
            existingActionCount={3}
            existingFollowUpCount={1}
            onTakeAction={vi.fn()}
            onUnlockPriorityTier={vi.fn()}
          />
        );
        // The prompt is a Triage-guided-flow element — an empty Action/Follow-Up tab
        // must show its own (filtered/normal) empty state, not the well-done prompt.
        expect(screen.queryByTestId('guided-peek-prompt')).toBeNull();
      }
    );
  });

  describe('no pre-existing Action/Follow-Up work → no gating prompt', () => {
    it('does NOT render the prompt when there is zero existing work (reveal is handled in Inbox)', () => {
      render(
        <EmailListStates
          {...baseProps}
          emailsEmpty
          minPriority={HIGH_PRIORITY_THRESHOLD}
          maxPriority={null}
          priorityCounts={{ veryHigh: 0, high: 0, medium: 7, low: 2, veryLow: 0 }}
          existingActionCount={0}
          existingFollowUpCount={0}
          onTakeAction={vi.fn()}
          onUnlockPriorityTier={vi.fn()}
        />
      );
      // Premise ("go do your other work") doesn't hold with nothing waiting, so the
      // prompt is suppressed; the filtered-empty fallback shows the lower emails cue.
      expect(screen.queryByTestId('guided-peek-prompt')).toBeNull();
      expect(screen.getByTestId('filtered-empty-state')).toBeTruthy();
    });

    it('renders the prompt when Follow-Up work exists even though Action is empty', () => {
      render(
        <EmailListStates
          {...baseProps}
          emailsEmpty
          minPriority={HIGH_PRIORITY_THRESHOLD}
          maxPriority={null}
          priorityCounts={{ veryHigh: 0, high: 0, medium: 7, low: 2, veryLow: 0 }}
          existingActionCount={0}
          existingFollowUpCount={2}
          onTakeAction={vi.fn()}
          onUnlockPriorityTier={vi.fn()}
        />
      );
      expect(screen.getByTestId('guided-peek-prompt')).toBeTruthy();
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
          onTakeAction={vi.fn()}
          onUnlockPriorityTier={vi.fn()}
        />
      );
      expect(screen.queryByTestId('guided-peek-prompt')).toBeNull();
      expect(screen.getByTestId('filtered-empty-state')).toBeTruthy();
    });

    it('does not show the prompt for a manual Very-High (bounded floor) view', () => {
      render(
        <EmailListStates
          {...baseProps}
          emailsEmpty
          minPriority={VERY_HIGH_PRIORITY_THRESHOLD}
          maxPriority={null}
          priorityCounts={{ veryHigh: 0, high: 5, medium: 2, low: 0, veryLow: 0 }}
          onTakeAction={vi.fn()}
          onUnlockPriorityTier={vi.fn()}
        />
      );
      // min=50 is not the guided High floor (30) → FilteredEmptyState, no prompt.
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
          onTakeAction={vi.fn()}
          onUnlockPriorityTier={vi.fn()}
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
          onTakeAction={vi.fn()}
          onUnlockPriorityTier={vi.fn()}
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

  describe('FilteredEmptyState — manual bucket', () => {
    it('calls onClearFilters when "Show all" is clicked', () => {
      const onClearFilters = vi.fn();
      render(
        <EmailListStates
          {...baseProps}
          emailsEmpty
          minPriority={MEDIUM_PRIORITY_THRESHOLD}
          maxPriority={HIGH_PRIORITY_THRESHOLD}
          priorityCounts={{ veryHigh: 0, high: 0, medium: 0, low: 2, veryLow: 1 }}
          onTakeAction={vi.fn()}
          onUnlockPriorityTier={vi.fn()}
          onClearFilters={onClearFilters}
        />
      );
      expect(screen.getByTestId('show-all-btn')).toBeTruthy();
      fireEvent.click(screen.getByTestId('show-all-btn'));
      expect(onClearFilters).toHaveBeenCalledTimes(1);
    });

    it('shows the total lower-priority count (low=2, veryLow=1 => 3)', () => {
      render(
        <EmailListStates
          {...baseProps}
          emailsEmpty
          minPriority={MEDIUM_PRIORITY_THRESHOLD}
          maxPriority={HIGH_PRIORITY_THRESHOLD}
          priorityCounts={{ veryHigh: 0, high: 0, medium: 0, low: 2, veryLow: 1 }}
          onTakeAction={vi.fn()}
          onUnlockPriorityTier={vi.fn()}
        />
      );
      expect(screen.getByTestId('filtered-lower-count').textContent).toBe('3');
    });
  });
});
