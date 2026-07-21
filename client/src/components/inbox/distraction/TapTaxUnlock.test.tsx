import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { DISTRACTION_TAP_TARGET } from 'constants/distractionFriction';

import { TapTaxUnlock } from './TapTaxUnlock';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
  }),
}));

describe('TapTaxUnlock', () => {
  it('unlocks only after exactly DISTRACTION_TAP_TARGET taps', () => {
    const onUnlocked = vi.fn();
    render(<TapTaxUnlock onUnlocked={onUnlocked} />);

    const button = screen.getByTestId('distraction-tap-button');

    // One short of the target must NOT unlock.
    for (let i = 0; i < DISTRACTION_TAP_TARGET - 1; i += 1) {
      fireEvent.click(button);
    }
    expect(onUnlocked).not.toHaveBeenCalled();

    // The final tap crosses the threshold and unlocks exactly once.
    fireEvent.click(button);
    expect(onUnlocked).toHaveBeenCalledTimes(1);
  });

  it('shows a live tap counter that reaches the target', () => {
    render(<TapTaxUnlock onUnlocked={vi.fn()} />);
    const button = screen.getByTestId('distraction-tap-button');

    for (let i = 0; i < DISTRACTION_TAP_TARGET; i += 1) {
      fireEvent.click(button);
    }

    const counter = screen.getByTestId('distraction-tap-counter');
    // t() mock echoes the interpolation opts as JSON — assert the final count.
    expect(counter.textContent).toContain(`"taps":${DISTRACTION_TAP_TARGET}`);
    expect(counter.textContent).toContain(`"total":${DISTRACTION_TAP_TARGET}`);
  });
});
