import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';

import { HoldToConfirmButton } from './HoldToConfirmButton';

describe('HoldToConfirmButton', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const renderButton = (onConfirm = vi.fn(), durationMs = 1000) => {
    render(
      <HoldToConfirmButton
        label="Hold to send anyway"
        holdMessage="Double check the email"
        onConfirm={onConfirm}
        durationMs={durationMs}
      />
    );
    return onConfirm;
  };

  it('shows the hold message while pressed and hides it on release', () => {
    renderButton();
    const button = screen.getByRole('button', { name: 'Hold to send anyway' });

    expect(screen.queryByText('Double check the email')).not.toBeInTheDocument();
    fireEvent.pointerDown(button);
    expect(screen.getByText('Double check the email')).toBeInTheDocument();
    fireEvent.pointerUp(button);
    expect(screen.queryByText('Double check the email')).not.toBeInTheDocument();
  });

  it('does not confirm when released before the hold duration', () => {
    const onConfirm = renderButton();
    const button = screen.getByRole('button', { name: 'Hold to send anyway' });

    fireEvent.pointerDown(button);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    fireEvent.pointerUp(button);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('confirms exactly once after holding for the full duration', () => {
    const onConfirm = renderButton();
    const button = screen.getByRole('button', { name: 'Hold to send anyway' });

    fireEvent.pointerDown(button);
    act(() => {
      vi.advanceTimersByTime(1200);
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('cancels when the pointer leaves the button', () => {
    const onConfirm = renderButton();
    const button = screen.getByRole('button', { name: 'Hold to send anyway' });

    fireEvent.pointerDown(button);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    fireEvent.pointerLeave(button);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('supports holding via the keyboard', () => {
    const onConfirm = renderButton();
    const button = screen.getByRole('button', { name: 'Hold to send anyway' });

    fireEvent.keyDown(button, { key: 'Enter' });
    act(() => {
      vi.advanceTimersByTime(1200);
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('does nothing when disabled', () => {
    const onConfirm = vi.fn();
    render(
      <HoldToConfirmButton
        label="Hold to send anyway"
        holdMessage="Double check the email"
        onConfirm={onConfirm}
        durationMs={1000}
        disabled
      />
    );
    const button = screen.getByRole('button', { name: 'Hold to send anyway' });
    fireEvent.pointerDown(button);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
