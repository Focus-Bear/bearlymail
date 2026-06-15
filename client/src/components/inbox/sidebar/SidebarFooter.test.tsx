import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { SidebarFooter } from './SidebarFooter';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('utils/posthog', () => ({ captureEvent: vi.fn() }));

describe('SidebarFooter', () => {
  it('does not show the logout button until the account menu is opened', () => {
    render(<SidebarFooter userEmail="alice@example.com" onLogout={vi.fn()} />);
    expect(screen.queryByText('auth.logout')).not.toBeInTheDocument();
  });

  it('reveals logout when the email/account button is clicked', () => {
    render(<SidebarFooter userEmail="alice@example.com" onLogout={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'auth.accountMenu' }));
    expect(screen.getByText('auth.logout')).toBeInTheDocument();
  });

  it('invokes onLogout from the menu', () => {
    const onLogout = vi.fn();
    render(<SidebarFooter userEmail="alice@example.com" onLogout={onLogout} />);
    fireEvent.click(screen.getByRole('button', { name: 'auth.accountMenu' }));
    fireEvent.click(screen.getByText('auth.logout'));
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it('works collapsed (no email text) via the avatar button', () => {
    render(<SidebarFooter userEmail="alice@example.com" onLogout={vi.fn()} isCollapsed />);
    expect(screen.queryByText('alice@example.com')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'auth.accountMenu' }));
    expect(screen.getByText('auth.logout')).toBeInTheDocument();
  });
});
