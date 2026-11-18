import React from 'react';
import { render, screen } from '@testing-library/react';
import { CRM_MATCH_KINDS, CrmSenderContext } from 'types/crm-sender-context';

import { CrmSenderContextView } from './CrmSenderContextView';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => (options ? `${key}:${JSON.stringify(options)}` : key),
    i18n: { language: 'en' },
  }),
}));

const RECORD_URL = 'https://bigin.zoho.com/bigin/Home#/contacts/c1';

const CONTEXT: CrmSenderContext = {
  provider: 'zoho_bigin',
  matchedBy: CRM_MATCH_KINDS.CONTACT_EMAIL,
  matchCount: 1,
  contact: { id: 'c1', name: 'Ada Lovelace', title: 'CTO', owner: 'Jeremy' },
  company: { id: 'a1', name: 'Acme', website: null },
  deals: [
    {
      id: 'd1',
      name: 'Acme pilot',
      stage: 'Proposal',
      isOpen: true,
      amount: 12000,
      closingDate: null,
      pipeline: 'Sales',
    },
    {
      id: 'd2',
      name: 'Acme 2025',
      stage: 'Closed Won',
      isOpen: false,
      amount: null,
      closingDate: null,
      pipeline: null,
    },
  ],
  recordUrl: RECORD_URL,
  notes: [{ id: 'n1', title: 'Call', content: 'Wants a quote.', createdAt: null }],
};

describe('CrmSenderContextView', () => {
  it('shows the contact, company, deals and notes', () => {
    render(<CrmSenderContextView context={CONTEXT} sourceName="Zoho Bigin" />);

    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('Acme')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'senderContext.crm.deals' })).toBeInTheDocument();
    expect(screen.getByText('Acme pilot')).toBeInTheDocument();
    expect(screen.getByText('Proposal · 12,000 · Sales')).toBeInTheDocument();
    expect(screen.getByText(/senderContext\.crm\.closed/)).toBeInTheDocument();
    expect(screen.getByText('Wants a quote.')).toBeInTheDocument();
    expect(screen.queryByText(/multipleMatches/)).not.toBeInTheDocument();
  });

  it('links to the record in the CRM in a new tab', () => {
    render(<CrmSenderContextView context={CONTEXT} sourceName="Zoho Bigin" />);

    const link = screen.getByRole('link', { name: /senderContext\.crm\.openRecord/ });
    expect(link).toHaveAttribute('href', RECORD_URL);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('flags domain matches and multiple matches, and hides empty sections', () => {
    render(
      <CrmSenderContextView
        context={{
          ...CONTEXT,
          matchedBy: CRM_MATCH_KINDS.COMPANY_DOMAIN,
          matchCount: 3,
          contact: null,
          deals: [],
          notes: [],
          recordUrl: null,
        }}
        sourceName="Zoho Bigin"
      />
    );

    expect(screen.getByText('senderContext.crm.matchedByDomain')).toBeInTheDocument();
    expect(screen.getByText(/senderContext\.crm\.multipleMatches/)).toBeInTheDocument();
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
