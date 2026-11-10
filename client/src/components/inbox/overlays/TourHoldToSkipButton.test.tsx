import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';

import { TOUR_SKIP_HOLD_DURATION_MS } from 'constants/tour';

import { TourHoldToSkipButton } from './TourHoldToSkipButton';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key),
  }),
}));

const ONE_SECOND_MS = 1000;
const MESSAGE_ID = 'skip-message';

function mockReducedMotion(matches: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function renderButton() {
  const onSkip = vi.fn();
  render(
    <>
      <p id={MESSAGE_ID}>We recommend the tour</p>
      <TourHoldToSkipButton onSkip={onSkip} describedById={MESSAGE_ID} />
    </>
  );
  return { onSkip, button: screen.getByRole('button') };
}

describe('TourHoldToSkipButton', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockReducedMotion(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('holds for 10 seconds by default', () => {
    expect(TOUR_SKIP_HOLD_DURATION_MS).toBe(10 * ONE_SECOND_MS);
  });

  it('skips exactly once after a full press-and-hold', () => {
    const { onSkip, button } = renderButton();

    fireEvent.pointerDown(button);
    advance(TOUR_SKIP_HOLD_DURATION_MS - ONE_SECOND_MS);
    expect(onSkip).not.toHaveBeenCalled();
    advance(ONE_SECOND_MS);

    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it('cancels when released early, and says so to screen readers', () => {
    const { onSkip, button } = renderButton();

    fireEvent.pointerDown(button);
    advance(TOUR_SKIP_HOLD_DURATION_MS - ONE_SECOND_MS);
    fireEvent.pointerUp(button);
    advance(TOUR_SKIP_HOLD_DURATION_MS);

    expect(onSkip).not.toHaveBeenCalled();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    expect(screen.getByRole('status')).toHaveTextContent('onboarding.tourSkipPrompt.releasedEarly');
  });

  it('lets keyboard users hold Space to skip, ignoring key auto-repeat', () => {
    const { onSkip, button } = renderButton();

    fireEvent.keyDown(button, { key: ' ' });
    advance(TOUR_SKIP_HOLD_DURATION_MS / 2);
    fireEvent.keyDown(button, { key: ' ', repeat: true });
    advance(TOUR_SKIP_HOLD_DURATION_MS / 2);

    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it('cancels when the held Enter key is released early', () => {
    const { onSkip, button } = renderButton();

    fireEvent.keyDown(button, { key: 'Enter' });
    advance(ONE_SECOND_MS);
    fireEvent.keyUp(button, { key: 'Enter' });
    advance(TOUR_SKIP_HOLD_DURATION_MS);

    expect(onSkip).not.toHaveBeenCalled();
  });

  it('announces the countdown while held and shows progress on the button', () => {
    const { button } = renderButton();

    fireEvent.pointerDown(button);
    advance(TOUR_SKIP_HOLD_DURATION_MS / 2);

    expect(screen.getByRole('status')).toHaveTextContent('onboarding.tourSkipPrompt.keepHolding:{"count":5}');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
    expect(screen.getByTestId('tour-skip-hold-fill')).toHaveStyle({ width: '50%' });
  });

  it('drops the animated fill under reduced motion and keeps the countdown', () => {
    mockReducedMotion(true);
    const { button } = renderButton();

    fireEvent.pointerDown(button);
    advance(ONE_SECOND_MS);

    expect(screen.queryByTestId('tour-skip-hold-fill')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('onboarding.tourSkipPrompt.keepHolding');
  });

  it('takes focus and is described by the recommendation message', () => {
    const { button } = renderButton();

    expect(button).toHaveFocus();
    expect(button).toHaveAccessibleDescription('We recommend the tour');
  });

  it('keeps the hold keys from reaching the inbox shortcuts underneath', () => {
    const inboxShortcut = vi.fn();
    window.addEventListener('keydown', inboxShortcut);
    const { button } = renderButton();

    fireEvent.keyDown(button, { key: ' ' });

    expect(inboxShortcut).not.toHaveBeenCalled();
    window.removeEventListener('keydown', inboxShortcut);
  });
});
