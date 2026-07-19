import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen } from '@testing-library/react';

import { EmailDetailSidebar } from './EmailDetailSidebar';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('hooks/useResponsiveBreakpoints', () => ({
  useResponsiveBreakpoints: () => ({ isMobile: false, isTablet: false }),
}));

function renderAt(entry: { pathname: string; state?: unknown }) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <EmailDetailSidebar />
    </MemoryRouter>
  );
}

describe('EmailDetailSidebar', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('goes back to the inbox by default', () => {
    renderAt({ pathname: '/email/abc' });
    const backButton = screen.getByTitle('common.backToInbox');
    fireEvent.click(backButton);
    expect(mockNavigate).toHaveBeenCalledWith('/inbox');
  });

  it('returns to the preserved search results when opened from search', () => {
    renderAt({ pathname: '/email/abc', state: { from: 'search', search: '?q=invoice' } });
    const backButton = screen.getByTitle('search.backToSearchResults');
    fireEvent.click(backButton);
    expect(mockNavigate).toHaveBeenCalledWith('/search?q=invoice');
  });

  it('falls back to /search without a query when no search string was preserved', () => {
    renderAt({ pathname: '/email/abc', state: { from: 'search' } });
    fireEvent.click(screen.getByTitle('search.backToSearchResults'));
    expect(mockNavigate).toHaveBeenCalledWith('/search');
  });
});
