/**
 * Unit tests for the open-email priority dropdown chip.
 *
 * 1. The chip shows "Set priority" when nothing is chosen and the selected label otherwise.
 * 2. Levels stay hidden until the chip is opened.
 * 3. Opening reveals all three levels; selecting one emits its star count.
 * 4. Re-selecting the active level toggles back to 0, and aria-checked reflects selection.
 * 5. The menu closes after a selection.
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { PriorityChip } from './PriorityChip';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const openMenu = () => fireEvent.click(screen.getByRole('button', { name: 'inbox.setPriority' }));

describe('PriorityChip', () => {
  it('labels the chip "Set priority" with no level chosen and keeps the menu closed', () => {
    render(<PriorityChip starCount={0} onSelect={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'inbox.setPriority' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitemradio')).not.toBeInTheDocument();
  });

  it('opens the menu and emits the chosen star count', () => {
    const onSelect = vi.fn();
    render(<PriorityChip starCount={0} onSelect={onSelect} />);

    openMenu();
    expect(screen.getAllByRole('menuitemradio')).toHaveLength(3);

    fireEvent.click(screen.getByRole('menuitemradio', { name: /inbox.getOnIt/ }));

    expect(onSelect).toHaveBeenCalledWith(2, expect.anything());
  });

  it('marks the active level checked and toggles it back to 0', () => {
    const onSelect = vi.fn();
    render(<PriorityChip starCount={2} onSelect={onSelect} />);

    openMenu();
    const active = screen.getByRole('menuitemradio', { name: /inbox.getOnIt/ });
    expect(active).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(active);
    expect(onSelect).toHaveBeenCalledWith(0, expect.anything());
  });

  it('closes the menu after a selection', () => {
    render(<PriorityChip starCount={0} onSelect={vi.fn()} />);

    openMenu();
    fireEvent.click(screen.getByRole('menuitemradio', { name: /inbox.canWait/ }));

    expect(screen.queryByRole('menuitemradio')).not.toBeInTheDocument();
  });
});
