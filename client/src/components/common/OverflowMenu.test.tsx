import { fireEvent, render, screen } from '@testing-library/react';

import { OverflowMenu } from './OverflowMenu';

describe('OverflowMenu', () => {
  const openMenu = () => {
    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
  };

  it('fires the item onClick despite the preceding mousedown (portal outside-click regression)', () => {
    const onBlock = vi.fn();
    render(<OverflowMenu items={[{ key: 'block', label: 'Block sender', onClick: onBlock }]} />);

    openMenu();
    const item = screen.getByRole('menuitem', { name: 'Block sender' });
    // A real click is mousedown → mouseup → click. The dropdown is portalled to
    // document.body, so a container-only outside-click check unmounts the item
    // on mousedown and the click never lands.
    fireEvent.mouseDown(item);
    fireEvent.mouseUp(item);
    fireEvent.click(item);

    expect(onBlock).toHaveBeenCalledTimes(1);
  });

  it('closes after an item is clicked', () => {
    render(<OverflowMenu items={[{ key: 'a', label: 'Action', onClick: vi.fn() }]} />);

    openMenu();
    const item = screen.getByRole('menuitem', { name: 'Action' });
    fireEvent.mouseDown(item);
    fireEvent.mouseUp(item);
    fireEvent.click(item);

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes on a genuine outside mousedown', () => {
    render(<OverflowMenu items={[{ key: 'a', label: 'Action', onClick: vi.fn() }]} />);

    openMenu();
    expect(screen.getByRole('menu')).toBeInTheDocument();

    fireEvent.mouseDown(document.body);

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
