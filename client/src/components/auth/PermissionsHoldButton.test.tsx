import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';

import { PermissionsHoldButton } from './PermissionsHoldButton';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key),
  }),
}));

const HOLD_MS = 5000;

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
  const onConfirm = vi.fn();
  render(<PermissionsHoldButton label="Hold to continue to Google" onConfirm={onConfirm} />);
  return { onConfirm, button: screen.getByRole('button') };
}

describe('PermissionsHoldButton', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockReducedMotion(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not continue when the pointer is released before 5 seconds', () => {
    const { onConfirm, button } = renderButton();

    fireEvent.pointerDown(button);
    advance(HOLD_MS - 1000);
    fireEvent.pointerUp(button);
    advance(HOLD_MS);

    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('resets progress when released early, so the next hold starts from zero', () => {
    const { onConfirm, button } = renderButton();

    fireEvent.pointerDown(button);
    advance(HOLD_MS - 1000);
    fireEvent.pointerUp(button);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');

    fireEvent.pointerDown(button);
    advance(HOLD_MS - 1000);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('continues exactly once after a full 5 second hold', () => {
    const { onConfirm, button } = renderButton();

    fireEvent.pointerDown(button);
    advance(HOLD_MS + 200);

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('does not continue on a simple click', () => {
    const { onConfirm, button } = renderButton();

    fireEvent.click(button);
    advance(HOLD_MS * 2);

    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('supports holding Space for keyboard users, ignoring key auto-repeat', () => {
    const { onConfirm, button } = renderButton();

    fireEvent.keyDown(button, { key: ' ' });
    advance(2000);
    fireEvent.keyDown(button, { key: ' ', repeat: true });
    advance(HOLD_MS - 2000 + 200);

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('cancels a keyboard hold when Enter is released early', () => {
    const { onConfirm, button } = renderButton();

    fireEvent.keyDown(button, { key: 'Enter' });
    advance(3000);
    fireEvent.keyUp(button, { key: 'Enter' });
    advance(HOLD_MS);

    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('exposes hold progress and a countdown to assistive tech', () => {
    const { button } = renderButton();

    expect(button).toHaveAttribute('aria-label', expect.stringContaining('auth.permissions.hold.ariaLabel'));
    fireEvent.pointerDown(button);
    advance(2000);

    expect(Number(screen.getByRole('progressbar').getAttribute('aria-valuenow'))).toBeGreaterThanOrEqual(40);
    expect(screen.getByRole('status')).toHaveTextContent('auth.permissions.hold.keepHolding:{"count":3}');
  });

  it('drops the animated fill under prefers-reduced-motion but still requires the full hold', () => {
    mockReducedMotion(true);
    const { onConfirm, button } = renderButton();

    expect(screen.queryByTestId('hold-fill')).not.toBeInTheDocument();
    fireEvent.pointerDown(button);
    advance(HOLD_MS - 1000);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('"count":1');
    advance(1200);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
