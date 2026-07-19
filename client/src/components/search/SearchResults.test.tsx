import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { Email } from 'types/email';

import { SearchResults } from './SearchResults';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('utils/posthog', () => ({
  captureEvent: vi.fn(),
}));

const email: Email = {
  id: 'email-1',
  subject: 'Quarterly invoice',
  from: 'billing@example.com',
  receivedAt: new Date().toISOString(),
  isRead: true,
  isSnoozed: false,
  threadId: 'thread-1',
};

const defaultProps = {
  searchResults: [email],
  onSelectScoreBreakdown: vi.fn(),
  getScoreBackgroundColor: () => '#fff',
  getScoreColor: () => '#000',
  getPriorityBadge: () => ({ label: 'Low', color: '#000', bg: '#fff' }),
};

describe('SearchResults', () => {
  it('navigates to the email with search-return state so the back button can restore results', () => {
    render(
      <MemoryRouter initialEntries={['/search?q=invoice']}>
        <SearchResults {...defaultProps} />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByText('Quarterly invoice'));

    expect(mockNavigate).toHaveBeenCalledWith('/email/email-1', {
      state: { from: 'search', search: '?q=invoice' },
    });
  });
});
