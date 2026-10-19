import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import Contacts from './Contacts';

// The bug: with a non-empty query and no matches, the page fell back to the
// full contact list ("3598 contact"), so it looked like search ignored the query.

const mockGet = vi.fn();

vi.mock('axios', () => ({
  default: { get: (...args: unknown[]) => mockGet(...args) },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { query?: string; count?: number }) =>
      options?.query !== undefined ? `${key}:${options.query}` : `${key}:${options?.count ?? ''}`,
    i18n: { language: 'en' },
  }),
}));

vi.mock('contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1', email: 'me@example.com' }, logout: vi.fn() }),
}));

vi.mock('contexts/NotificationContext', () => ({
  useNotifications: () => ({ showInfo: vi.fn() }),
}));

vi.mock('hooks/useResponsiveBreakpoints', () => ({
  useResponsiveBreakpoints: () => ({ isMobile: false, isTablet: false, isDesktop: true }),
}));

vi.mock('hooks/useSidebarState', () => ({
  useSidebarState: () => ({
    isCollapsed: false,
    canToggleCollapse: true,
    isMobileMenuOpen: false,
    toggleCollapse: vi.fn(),
    openMobileMenu: vi.fn(),
    closeMobileMenu: vi.fn(),
  }),
}));

vi.mock('components/inbox/Sidebar', () => ({ Sidebar: () => null }));
vi.mock('components/admin/InlineContactSearchDebug', () => ({ InlineContactSearchDebug: () => null }));

const allContacts = [
  { id: '11111111-1111-1111-1111-111111111111', email: 'first.person@example.com', name: 'First Person' },
  { id: '22222222-2222-2222-2222-222222222222', email: 'second.person@example.com', name: 'Second Person' },
];

vi.mock('hooks/useContactsData', () => ({
  useContactsData: () => ({
    contacts: allContacts,
    contactTypes: [],
    loading: false,
    syncing: false,
    error: null,
    handleSync: vi.fn(),
    getContactTypeConfig: () => undefined,
  }),
}));

const renderContacts = () =>
  render(
    <MemoryRouter>
      <Contacts />
    </MemoryRouter>
  );

const typeQuery = (query: string) =>
  fireEvent.change(screen.getByPlaceholderText('contacts.searchPlaceholder:'), { target: { value: query } });

describe('Contacts page search', () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  it('shows an empty state instead of the full list when the query has no matches', async () => {
    mockGet.mockResolvedValue({ data: [] });
    renderContacts();
    expect(screen.getByText('First Person')).toBeInTheDocument();

    typeQuery('andrew lam');

    expect(await screen.findByText('contacts.noSearchResults:andrew lam')).toBeInTheDocument();
    expect(screen.queryByText('First Person')).not.toBeInTheDocument();
    expect(screen.queryByText(/contacts\.totalContacts/)).not.toBeInTheDocument();
  });

  it('lists only the results, with a count that reflects them', async () => {
    const match = {
      id: '33333333-3333-3333-3333-333333333333',
      email: 'andrew.lam-po-tang@example.org',
      isLocal: true,
    };
    mockGet.mockImplementation((url: string) =>
      Promise.resolve({ data: url.includes('/contacts/search') ? [match] : [] })
    );
    renderContacts();

    typeQuery('andrew lam');

    await waitFor(() => expect(screen.getByText('contacts.totalContacts:1')).toBeInTheDocument());
    expect(screen.getByText('andrew.lam-po-tang@example.org')).toBeInTheDocument();
    expect(screen.queryByText('First Person')).not.toBeInTheDocument();
  });
});
