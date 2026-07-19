import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen } from '@testing-library/react';

import { BackToInboxLink } from './BackToInboxLink';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter initialEntries={['/compose']}>{ui}</MemoryRouter>);
}

describe('BackToInboxLink', () => {
  it('renders the shared back-to-inbox label by default', () => {
    renderWithRouter(<BackToInboxLink />);
    expect(screen.getByText('common.backToInbox')).toBeInTheDocument();
  });

  it('renders as a real link pointing at the inbox', () => {
    renderWithRouter(<BackToInboxLink />);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/inbox');
  });

  it('supports overriding the destination and label for back-to-search', () => {
    renderWithRouter(<BackToInboxLink to="/search?q=invoice" label="Back to search results" />);
    const link = screen.getByRole('link', { name: /Back to search results/ });
    expect(link).toHaveAttribute('href', '/search?q=invoice');
  });

  it('invokes onClick (e.g. analytics) when the link is activated', () => {
    const onClick = vi.fn();
    renderWithRouter(<BackToInboxLink onClick={onClick} />);
    fireEvent.click(screen.getByRole('link'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
