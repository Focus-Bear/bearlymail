import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { DealFormModal } from 'components/crm/DealFormModal';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const labels: Record<string, string> = {
        'deals.addDeal': 'Add Deal',
        'deals.editDeal': 'Edit Deal',
        'deals.dealTitle': 'Deal Title',
        'deals.dealDetails': 'Deal Details',
        'deals.dealValue': 'Deal Value',
        'deals.currency': 'Currency',
        'deals.dealStage': 'Deal Stage',
        'deals.contact': 'Contact',
        'deals.searchContacts': 'Search contacts...',
        'deals.noContactsFound': 'No contacts found',
        'deals.expectedClose': 'Expected Close',
        'deals.cancel': 'Cancel',
        'deals.save': 'Save',
      };
      return labels[key] || key;
    },
  }),
}));

describe('DealFormModal contact typeahead', () => {
  const defaultProps = {
    deal: null,
    stages: [
      { id: 'stage-1', name: 'Prospect', position: 0, sortOrder: 0, color: '#000', isWon: false, isLost: false },
    ],
    contacts: [
      { id: '1', name: 'Amanda Noble', email: 'amanda@example.com' },
      { id: '2', name: 'Jeremy Nagel', email: 'jeremy@example.com' },
      { email: 'no-id@example.com' },
    ],
    onSave: vi.fn(),
    onClose: vi.fn(),
  };

  it('filters contacts and selects a matching contact', () => {
    render(<DealFormModal {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: 'Contact' }));
    fireEvent.change(screen.getByPlaceholderText('Search contacts...'), { target: { value: 'amanda' } });

    expect(screen.getByRole('option', { name: 'Amanda Noble' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Jeremy Nagel' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('option', { name: 'Amanda Noble' }));

    expect(screen.getByRole('button', { name: 'Contact' })).toHaveTextContent('Amanda Noble');
  });

  it('supports keyboard selection in the contact search', () => {
    render(<DealFormModal {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: 'Contact' }));

    const searchInput = screen.getByPlaceholderText('Search contacts...');
    fireEvent.change(searchInput, { target: { value: 'jeremy' } });
    fireEvent.keyDown(searchInput, { key: 'ArrowDown' });
    fireEvent.keyDown(searchInput, { key: 'ArrowDown' });
    fireEvent.keyDown(searchInput, { key: 'Enter' });

    expect(screen.getByRole('button', { name: 'Contact' })).toHaveTextContent('Jeremy Nagel');
  });

  it('does not render contacts that are missing an id', () => {
    render(<DealFormModal {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: 'Contact' }));

    expect(screen.queryByRole('option', { name: 'no-id@example.com' })).not.toBeInTheDocument();
  });
});
