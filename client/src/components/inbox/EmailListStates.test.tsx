import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { HIGH_PRIORITY_THRESHOLD, LOW_PRIORITY_THRESHOLD, MEDIUM_PRIORITY_THRESHOLD, VERY_HIGH_PRIORITY_THRESHOLD } from 'hooks/useInboxFilters';

import { EmailListStates } from './EmailListStates';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts) {
        return `${key}:${JSON.stringify(opts)}`;
      }
      return key;
    },
  }),
}));

jest.mock('theme/theme', () => ({
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

jest.mock('components/inbox/states', () => ({
  AllCaughtUpState: () => <div data-testid="all-caught-up-state">AllCaughtUp</div>,
  EmptyState: ({ mode }: { mode: string }) => <div data-testid="empty-state">{mode}</div>,
  ErrorState: ({ error }: { error: string }) => <div data-testid="error-state">{error}</div>,
  LoadingState: () => <div data-testid="loading-state">Loading</div>,
  ProgressiveUnlockPrompt: ({
    message,
    onYes,
    onLater,
  }: {
    message: string;
    onYes: () => void;
    onLater: () => void;
  }) => (
    <div data-testid="progressive-unlock-prompt">
      <span>{message}</span>
      <button data-testid="yes-btn" onClick={onYes}>Yes</button>
      <button data-testid="later-btn" onClick={onLater}>Later</button>
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
  onRetry: jest.fn(),
};

describe('EmailListStates', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

  describe('progressive unlock — very high to high', () => {
    it('renders ProgressiveUnlockPrompt when very-high inbox empty and high count > 0', () => {
      render(
        <EmailListStates
          {...baseProps}
          emailsEmpty
          minPriority={VERY_HIGH_PRIORITY_THRESHOLD}
          priorityCounts={{ veryHigh: 0, high: 5, medium: 3, low: 2, veryLow: 0 }}
          onUnlockPriorityTier={jest.fn()}
          onDismissUnlockPrompt={jest.fn()}
        />
      );
      expect(screen.getByTestId('progressive-unlock-prompt')).toBeTruthy();
    });

    it('calls onUnlockPriorityTier(HIGH_PRIORITY_THRESHOLD, VERY_HIGH_PRIORITY_THRESHOLD) on Yes', () => {
      const onUnlockPriorityTier = jest.fn();
      render(
        <EmailListStates
          {...baseProps}
          emailsEmpty
          minPriority={VERY_HIGH_PRIORITY_THRESHOLD}
          priorityCounts={{ veryHigh: 0, high: 5, medium: 3, low: 2, veryLow: 0 }}
          onUnlockPriorityTier={onUnlockPriorityTier}
          onDismissUnlockPrompt={jest.fn()}
        />
      );
      fireEvent.click(screen.getByTestId('yes-btn'));
      expect(onUnlockPriorityTier).toHaveBeenCalledWith(HIGH_PRIORITY_THRESHOLD, VERY_HIGH_PRIORITY_THRESHOLD);
    });

    it('hides ProgressiveUnlockPrompt and shows EmptyState after dismissal', () => {
      const onDismissUnlockPrompt = jest.fn();
      render(
        <EmailListStates
          {...baseProps}
          emailsEmpty
          minPriority={VERY_HIGH_PRIORITY_THRESHOLD}
          priorityCounts={{ veryHigh: 0, high: 5, medium: 3, low: 2, veryLow: 0 }}
          onUnlockPriorityTier={jest.fn()}
          onDismissUnlockPrompt={onDismissUnlockPrompt}
        />
      );
      fireEvent.click(screen.getByTestId('later-btn'));
      expect(onDismissUnlockPrompt).toHaveBeenCalled();
      expect(screen.queryByTestId('progressive-unlock-prompt')).toBeNull();
      expect(screen.getByTestId('empty-state')).toBeTruthy();
    });

    it('does NOT render ProgressiveUnlockPrompt when high count is 0', () => {
      render(
        <EmailListStates
          {...baseProps}
          emailsEmpty
          minPriority={VERY_HIGH_PRIORITY_THRESHOLD}
          priorityCounts={{ veryHigh: 0, high: 0, medium: 0, low: 0, veryLow: 0 }}
          onUnlockPriorityTier={jest.fn()}
          onDismissUnlockPrompt={jest.fn()}
        />
      );
      expect(screen.queryByTestId('progressive-unlock-prompt')).toBeNull();
    });
  });

  describe('progressive unlock — high to medium', () => {
    it('renders ProgressiveUnlockPrompt when high-priority inbox empty and medium count > 0', () => {
      render(
        <EmailListStates
          {...baseProps}
          emailsEmpty
          minPriority={HIGH_PRIORITY_THRESHOLD}
          priorityCounts={{ veryHigh: 0, high: 0, medium: 7, low: 2, veryLow: 0 }}
          onUnlockPriorityTier={jest.fn()}
          onDismissUnlockPrompt={jest.fn()}
        />
      );
      expect(screen.getByTestId('progressive-unlock-prompt')).toBeTruthy();
    });

    it('calls onUnlockPriorityTier(MEDIUM_PRIORITY_THRESHOLD, HIGH_PRIORITY_THRESHOLD) when user clicks Yes on high-done prompt', () => {
      const onUnlockPriorityTier = jest.fn();
      render(
        <EmailListStates
          {...baseProps}
          emailsEmpty
          minPriority={HIGH_PRIORITY_THRESHOLD}
          priorityCounts={{ veryHigh: 0, high: 0, medium: 7, low: 2, veryLow: 0 }}
          onUnlockPriorityTier={onUnlockPriorityTier}
          onDismissUnlockPrompt={jest.fn()}
        />
      );
      fireEvent.click(screen.getByTestId('yes-btn'));
      expect(onUnlockPriorityTier).toHaveBeenCalledWith(MEDIUM_PRIORITY_THRESHOLD, HIGH_PRIORITY_THRESHOLD);
    });

    it('does NOT render ProgressiveUnlockPrompt when medium count is 0', () => {
      render(
        <EmailListStates
          {...baseProps}
          emailsEmpty
          minPriority={HIGH_PRIORITY_THRESHOLD}
          priorityCounts={{ veryHigh: 0, high: 0, medium: 0, low: 0, veryLow: 0 }}
          onUnlockPriorityTier={jest.fn()}
          onDismissUnlockPrompt={jest.fn()}
        />
      );
      expect(screen.queryByTestId('progressive-unlock-prompt')).toBeNull();
    });
  });

  describe('progressive unlock — medium to low', () => {
    it('renders ProgressiveUnlockPrompt when medium inbox empty and low count > 0', () => {
      render(
        <EmailListStates
          {...baseProps}
          emailsEmpty
          minPriority={MEDIUM_PRIORITY_THRESHOLD}
          priorityCounts={{ veryHigh: 0, high: 0, medium: 0, low: 5, veryLow: 0 }}
          onUnlockPriorityTier={jest.fn()}
          onDismissUnlockPrompt={jest.fn()}
        />
      );
      expect(screen.getByTestId('progressive-unlock-prompt')).toBeTruthy();
    });

    it('calls onUnlockPriorityTier(LOW_PRIORITY_THRESHOLD, MEDIUM_PRIORITY_THRESHOLD) when user clicks Yes on medium-done prompt', () => {
      const onUnlockPriorityTier = jest.fn();
      render(
        <EmailListStates
          {...baseProps}
          emailsEmpty
          minPriority={MEDIUM_PRIORITY_THRESHOLD}
          priorityCounts={{ veryHigh: 0, high: 0, medium: 0, low: 5, veryLow: 0 }}
          onUnlockPriorityTier={onUnlockPriorityTier}
          onDismissUnlockPrompt={jest.fn()}
        />
      );
      fireEvent.click(screen.getByTestId('yes-btn'));
      expect(onUnlockPriorityTier).toHaveBeenCalledWith(LOW_PRIORITY_THRESHOLD, MEDIUM_PRIORITY_THRESHOLD);
    });
  });

  describe('all caught up — final state', () => {
    it('renders AllCaughtUpState when at low tier with all counts at zero', () => {
      render(
        <EmailListStates
          {...baseProps}
          emailsEmpty
          minPriority={0}
          priorityCounts={{ veryHigh: 0, high: 0, medium: 0, low: 0, veryLow: 0 }}
          onUnlockPriorityTier={jest.fn()}
          onDismissUnlockPrompt={jest.fn()}
        />
      );
      expect(screen.getByTestId('all-caught-up-state')).toBeTruthy();
    });

    it('does NOT render AllCaughtUpState when low count > 0', () => {
      render(
        <EmailListStates
          {...baseProps}
          emailsEmpty
          minPriority={0}
          priorityCounts={{ veryHigh: 0, high: 0, medium: 0, low: 3, veryLow: 0 }}
          onUnlockPriorityTier={jest.fn()}
          onDismissUnlockPrompt={jest.fn()}
        />
      );
      expect(screen.queryByTestId('all-caught-up-state')).toBeNull();
    });
  });

  describe('no filter (all-priorities mode)', () => {
    it('renders EmptyState when minPriority is null (all-priorities mode)', () => {
      render(
        <EmailListStates
          {...baseProps}
          emailsEmpty
          minPriority={null}
          priorityCounts={{ veryHigh: 0, high: 0, medium: 5, low: 2, veryLow: 0 }}
          onUnlockPriorityTier={jest.fn()}
          onDismissUnlockPrompt={jest.fn()}
        />
      );
      expect(screen.queryByTestId('progressive-unlock-prompt')).toBeNull();
      expect(screen.getByTestId('empty-state')).toBeTruthy();
    });
  });

  describe('non-empty inbox', () => {
    it('renders nothing when emails are not empty', () => {
      render(<EmailListStates {...baseProps} emailsEmpty={false} />);
      expect(screen.queryByTestId('loading-state')).toBeNull();
      expect(screen.queryByTestId('error-state')).toBeNull();
      expect(screen.queryByTestId('empty-state')).toBeNull();
      expect(screen.queryByTestId('progressive-unlock-prompt')).toBeNull();
    });
  });
});
