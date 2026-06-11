import React from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { fireEvent, render, screen } from '@testing-library/react';

import { useUnsavedChangesGuard } from './useUnsavedChangesGuard';

const Probe: React.FC<{ isDirty: boolean; onLinkClick?: () => void }> = ({ isDirty, onLinkClick }) => {
  const { pendingPath, confirmNavigation, cancelNavigation } = useUnsavedChangesGuard(isDirty);
  const location = useLocation();
  return (
    <div>
      <a
        href="/stats"
        onClick={event => {
          event.preventDefault();
          onLinkClick?.();
        }}
      >
        go to stats
      </a>
      <span data-testid="pending">{pendingPath ?? 'none'}</span>
      <span data-testid="location">{location.pathname}</span>
      <button onClick={confirmNavigation}>confirm</button>
      <button onClick={cancelNavigation}>cancel</button>
    </div>
  );
};

const renderProbe = (isDirty: boolean, onLinkClick?: () => void) =>
  render(
    <MemoryRouter initialEntries={['/settings']}>
      <Probe isDirty={isDirty} onLinkClick={onLinkClick} />
    </MemoryRouter>
  );

describe('useUnsavedChangesGuard', () => {
  it('does not intercept link clicks when there are no unsaved changes', () => {
    const onLinkClick = vi.fn();
    renderProbe(false, onLinkClick);

    fireEvent.click(screen.getByText('go to stats'));

    expect(onLinkClick).toHaveBeenCalled();
    expect(screen.getByTestId('pending')).toHaveTextContent('none');
  });

  it('intercepts internal link clicks when dirty and records the pending path', () => {
    const onLinkClick = vi.fn();
    renderProbe(true, onLinkClick);

    fireEvent.click(screen.getByText('go to stats'));

    expect(onLinkClick).not.toHaveBeenCalled();
    expect(screen.getByTestId('pending')).toHaveTextContent('/stats');
    expect(screen.getByTestId('location')).toHaveTextContent('/settings');
  });

  it('does not intercept same-page hash links while dirty', () => {
    const onLinkClick = vi.fn();
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <a
          href="#email-batching"
          onClick={event => {
            event.preventDefault();
            onLinkClick();
          }}
        >
          jump to section
        </a>
        <Probe isDirty />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByText('jump to section'));

    expect(onLinkClick).toHaveBeenCalled();
    expect(screen.getByTestId('pending')).toHaveTextContent('none');
  });

  it('stays on the page when navigation is cancelled', () => {
    renderProbe(true);

    fireEvent.click(screen.getByText('go to stats'));
    fireEvent.click(screen.getByText('cancel'));

    expect(screen.getByTestId('pending')).toHaveTextContent('none');
    expect(screen.getByTestId('location')).toHaveTextContent('/settings');
  });

  it('navigates to the pending path when navigation is confirmed', () => {
    renderProbe(true);

    fireEvent.click(screen.getByText('go to stats'));
    fireEvent.click(screen.getByText('confirm'));

    expect(screen.getByTestId('pending')).toHaveTextContent('none');
    expect(screen.getByTestId('location')).toHaveTextContent('/stats');
  });

  it('blocks page unload while dirty', () => {
    renderProbe(true);

    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it('allows page unload when not dirty', () => {
    renderProbe(false);

    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });
});
