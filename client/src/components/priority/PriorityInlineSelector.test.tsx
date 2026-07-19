/**
 * Unit tests for the slim inbox-list priority selector.
 *
 * 1. One pill per level (Can wait / Get on it / Oh sh$t), all visible at once.
 * 2. Selecting an inactive pill emits that star count; re-selecting the active one toggles to 0.
 * 3. A star count above the top level clamps to the highest level (aria-pressed).
 * 4. The recommended level (triage suggestion) carries the .animate-recommended-pulse class.
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { PriorityInlineSelector } from './PriorityInlineSelector';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('PriorityInlineSelector', () => {
  it('renders a pill for each level, all visible', () => {
    render(<PriorityInlineSelector starCount={0} onSelect={vi.fn()} />);
    ['inbox.canWait', 'inbox.getOnIt', 'inbox.ohShit'].forEach(name => {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    });
  });

  it('emits the chosen star count when an inactive pill is clicked', () => {
    const onSelect = vi.fn();
    render(<PriorityInlineSelector starCount={0} onSelect={onSelect} />);

    fireEvent.click(screen.getByRole('button', { name: 'inbox.getOnIt' }));

    expect(onSelect).toHaveBeenCalledWith(2, expect.anything());
  });

  it('toggles back to 0 when the active pill is clicked again', () => {
    const onSelect = vi.fn();
    render(<PriorityInlineSelector starCount={2} onSelect={onSelect} />);

    fireEvent.click(screen.getByRole('button', { name: 'inbox.getOnIt' }));

    expect(onSelect).toHaveBeenCalledWith(0, expect.anything());
  });

  it('marks the selected pill pressed and clamps overflow to the top level', () => {
    const { rerender } = render(<PriorityInlineSelector starCount={3} onSelect={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'inbox.ohShit' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'inbox.canWait' })).toHaveAttribute('aria-pressed', 'false');

    rerender(<PriorityInlineSelector starCount={5} onSelect={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'inbox.ohShit' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('pulses the recommended pill and leaves the others un-pulsed', () => {
    render(<PriorityInlineSelector starCount={0} onSelect={vi.fn()} recommendedStarCount={3} />);

    expect(screen.getByRole('button', { name: 'inbox.ohShit' })).toHaveClass('animate-recommended-pulse');
    expect(screen.getByRole('button', { name: 'inbox.canWait' })).not.toHaveClass('animate-recommended-pulse');
  });

  it('renders the optional leading pill (Archive) before the level pills', () => {
    render(
      <PriorityInlineSelector
        starCount={0}
        onSelect={vi.fn()}
        leadingPill={<button type="button">Archive</button>}
      />,
    );

    expect(screen.getByRole('button', { name: 'Archive' })).toBeInTheDocument();
  });
});
