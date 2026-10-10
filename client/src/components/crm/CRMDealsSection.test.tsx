import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';

import { CRMDealsSection } from './CRMDealsSection';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

vi.mock('axios', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: [] }),
    post: vi.fn().mockResolvedValue({ data: { id: 'contact-1' } }),
  },
}));

const mockedAxios = axios as unknown as {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
};

describe('CRMDealsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedAxios.get.mockResolvedValue({ data: [] });
    mockedAxios.post.mockResolvedValue({ data: { id: 'contact-1' } });
  });

  it('renders the Deals section header', () => {
    render(<CRMDealsSection senderEmail="person@example.com" />);
    expect(screen.getByText('crm.deals')).toBeInTheDocument();
  });

  it('renders the add-deal (+) button', () => {
    render(<CRMDealsSection senderEmail="person@example.com" />);
    expect(screen.getByTitle('crm.createDeal')).toBeInTheDocument();
  });

  it('ensures a contact for the sender and opens the deal form when + is clicked', async () => {
    render(<CRMDealsSection senderEmail="person@example.com" />);

    fireEvent.click(screen.getByTitle('crm.createDeal'));

    // Find-or-create the sender's contact so the deal has something to link to.
    await waitFor(() =>
      expect(mockedAxios.post).toHaveBeenCalledWith(expect.stringContaining('/contacts'), {
        email: 'person@example.com',
      })
    );
    // The deal form opens (header uses the "add" title for a new deal).
    expect(await screen.findByText('deals.addDeal')).toBeInTheDocument();
    // Stages + contacts were loaded for the form.
    expect(mockedAxios.get).toHaveBeenCalledWith(expect.stringContaining('/deals/stages'));
    expect(mockedAxios.get).toHaveBeenCalledWith(expect.stringContaining('/contacts'));
  });

  it('does not create a contact when the sender already has one (contactId provided)', async () => {
    render(<CRMDealsSection senderEmail="person@example.com" contactId="existing-contact" />);

    fireEvent.click(screen.getByTitle('crm.createDeal'));

    expect(await screen.findByText('deals.addDeal')).toBeInTheDocument();
    // A contactId was already known, so no find-or-create POST /contacts.
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });
});
