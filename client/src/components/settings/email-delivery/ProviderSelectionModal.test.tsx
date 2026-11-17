import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { ProviderSelectionModal } from './ProviderSelectionModal';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('ProviderSelectionModal', () => {
  it('shows a logo for every provider instead of its first letter', () => {
    render(<ProviderSelectionModal isOpen appleMailAvailable onClose={vi.fn()} onSelectProvider={vi.fn()} />);

    for (const id of ['gmail', 'office365', 'zoho', 'apple-mail', 'imap']) {
      expect(screen.getByTestId(`provider-icon-${id}`)).toBeInTheDocument();
    }
    expect(screen.queryByText('G')).not.toBeInTheDocument();
    expect(screen.queryByText('O')).not.toBeInTheDocument();
  });

  it('keeps the logos out of the button names read by screen readers', () => {
    render(<ProviderSelectionModal isOpen onClose={vi.fn()} onSelectProvider={vi.fn()} />);

    expect(screen.getByTestId('provider-icon-gmail')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('button', { name: /^Gmail/ })).toBeInTheDocument();
  });

  it('selects the provider and closes when a card is clicked', () => {
    const onClose = vi.fn();
    const onSelectProvider = vi.fn();
    render(<ProviderSelectionModal isOpen onClose={onClose} onSelectProvider={onSelectProvider} />);

    fireEvent.click(screen.getByRole('button', { name: /^Office 365/ }));

    expect(onSelectProvider).toHaveBeenCalledWith('office365');
    expect(onClose).toHaveBeenCalled();
  });
});
