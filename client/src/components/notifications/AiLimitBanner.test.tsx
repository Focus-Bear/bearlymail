/**
 * AiLimitBanner behaviour: appears on the first AI-limit 402 notification,
 * stays until dismissed, ignores repeat trips while visible, rate-limits
 * re-shows after dismissal, and deep-links to the plan picker.
 */
import React from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AI_LIMIT_BANNER_RESHOW_MS } from 'constants/numbers';
import { SETTINGS_PLANS_ROUTE } from 'constants/strings';

import { AiLimitBanner } from './AiLimitBanner';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

const notifierRef: { current: (() => void) | null } = { current: null };
vi.mock('utils/axios-interceptors', () => ({
  registerAiLimitNotifier: (cb: (() => void) | null) => {
    notifierRef.current = cb;
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const trip = () => act(() => notifierRef.current?.());

describe('AiLimitBanner', () => {
  let dateNowSpy: ReturnType<typeof vi.spyOn>;
  let now: number;

  beforeEach(() => {
    now = 1_000_000;
    dateNowSpy = vi.spyOn(Date, 'now').mockImplementation(() => now);
  });

  afterEach(() => {
    dateNowSpy.mockRestore();
  });

  it('renders nothing until an AI-limit 402 trips it', () => {
    render(<AiLimitBanner />);
    expect(screen.queryByTestId('ai-limit-banner')).not.toBeInTheDocument();
  });

  it('shows message, View plans and dismiss controls on the first trip and stays visible', () => {
    render(<AiLimitBanner />);
    trip();

    expect(screen.getByTestId('ai-limit-banner')).toBeInTheDocument();
    expect(screen.getByText('team.settings.aiLimitReached')).toBeInTheDocument();
    expect(screen.getByTestId('ai-limit-banner-view-plans')).toHaveTextContent('team.settings.planPicker.viewPlans');
    expect(screen.getByTestId('ai-limit-banner-dismiss')).toBeInTheDocument();

    // Repeat 402s while visible are no-ops (still exactly one banner).
    trip();
    expect(screen.getAllByTestId('ai-limit-banner')).toHaveLength(1);
  });

  it('hides on dismiss and does not re-show within the re-show window', async () => {
    const user = userEvent.setup();
    render(<AiLimitBanner />);
    trip();

    await user.click(screen.getByTestId('ai-limit-banner-dismiss'));
    expect(screen.queryByTestId('ai-limit-banner')).not.toBeInTheDocument();

    // A 402 shortly after dismissal must not bring the banner back...
    now += AI_LIMIT_BANNER_RESHOW_MS - 1000;
    trip();
    expect(screen.queryByTestId('ai-limit-banner')).not.toBeInTheDocument();

    // ...but once a full window has passed since it last appeared, it re-shows.
    now += 2000;
    trip();
    expect(screen.getByTestId('ai-limit-banner')).toBeInTheDocument();
  });

  it('navigates to the plans deep link and hides when View plans is clicked', async () => {
    const user = userEvent.setup();
    render(<AiLimitBanner />);
    trip();

    await user.click(screen.getByTestId('ai-limit-banner-view-plans'));

    expect(mockNavigate).toHaveBeenCalledWith(SETTINGS_PLANS_ROUTE);
    expect(screen.queryByTestId('ai-limit-banner')).not.toBeInTheDocument();
  });

  it('unregisters the notifier on unmount', () => {
    const { unmount } = render(<AiLimitBanner />);
    expect(notifierRef.current).not.toBeNull();
    unmount();
    expect(notifierRef.current).toBeNull();
  });
});
