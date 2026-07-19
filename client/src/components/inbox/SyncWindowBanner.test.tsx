import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { SYNC_WINDOW_BANNER_DISMISSED_KEY_PREFIX, SyncWindowBanner } from './SyncWindowBanner';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('theme/theme', () => ({
  theme: {
    spacing: { xs: '4px', sm: '8px', md: '12px' },
    colors: {
      background: { subtle: '#f5f5f5' },
      border: { light: '#e0e0e0' },
      text: { secondary: '#666' },
    },
    borderRadius: { md: '4px' },
    typography: { fontSize: { sm: '14px' } },
  },
}));

describe('SyncWindowBanner', () => {
  const userId = 'user-1';
  const storageKey = `${SYNC_WINDOW_BANNER_DISMISSED_KEY_PREFIX}${userId}`;

  beforeEach(() => {
    localStorage.clear();
  });

  it('shows the banner message when syncWindowLimited and not dismissed', () => {
    render(<SyncWindowBanner userId={userId} syncWindowLimited />);

    expect(screen.getByTestId('sync-window-banner')).toBeInTheDocument();
    expect(screen.getByText(/inbox\.syncWindowBanner\.message/)).toBeInTheDocument();
  });

  it('renders nothing when syncWindowLimited is false', () => {
    render(<SyncWindowBanner userId={userId} syncWindowLimited={false} />);

    expect(screen.queryByTestId('sync-window-banner')).not.toBeInTheDocument();
  });

  it('renders nothing when syncWindowLimited is undefined', () => {
    render(<SyncWindowBanner userId={userId} />);

    expect(screen.queryByTestId('sync-window-banner')).not.toBeInTheDocument();
  });

  it('hides on dismiss and persists the dismissal in localStorage', () => {
    render(<SyncWindowBanner userId={userId} syncWindowLimited />);

    fireEvent.click(screen.getByRole('button', { name: 'inbox.syncWindowBanner.dismiss' }));

    expect(screen.queryByTestId('sync-window-banner')).not.toBeInTheDocument();
    expect(localStorage.getItem(storageKey)).toBe('true');
  });

  it('stays hidden on remount after a previous dismissal', () => {
    localStorage.setItem(storageKey, 'true');

    render(<SyncWindowBanner userId={userId} syncWindowLimited />);

    expect(screen.queryByTestId('sync-window-banner')).not.toBeInTheDocument();
  });

  it('persists dismissal per user — another user still sees the banner', () => {
    localStorage.setItem(storageKey, 'true');

    render(<SyncWindowBanner userId="user-2" syncWindowLimited />);

    expect(screen.getByTestId('sync-window-banner')).toBeInTheDocument();
  });

  it('honours a stored dismissal when userId arrives after mount', () => {
    localStorage.setItem(storageKey, 'true');

    const { rerender } = render(<SyncWindowBanner userId={undefined} syncWindowLimited />);
    expect(screen.queryByTestId('sync-window-banner')).not.toBeInTheDocument();

    rerender(<SyncWindowBanner userId={userId} syncWindowLimited />);

    expect(screen.queryByTestId('sync-window-banner')).not.toBeInTheDocument();
  });

  it('re-evaluates dismissal when switching to a user who has not dismissed', () => {
    localStorage.setItem(storageKey, 'true');

    const { rerender } = render(<SyncWindowBanner userId={userId} syncWindowLimited />);
    expect(screen.queryByTestId('sync-window-banner')).not.toBeInTheDocument();

    rerender(<SyncWindowBanner userId="user-2" syncWindowLimited />);

    expect(screen.getByTestId('sync-window-banner')).toBeInTheDocument();
  });
});
