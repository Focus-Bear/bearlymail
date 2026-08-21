import React from 'react';
import { render, screen } from '@testing-library/react';

import { CRMDealsSection } from './CRMDealsSection';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

vi.mock('axios', () => ({
  default: { get: vi.fn().mockResolvedValue({ data: [] }) },
}));

describe('CRMDealsSection', () => {
  // The "+" add-deal control did nothing (dead onClick). Until add-deal-from-email
  // is implemented it should not be shown — a visible control that no-ops is worse
  // than no control. Tracked as a separate follow-up issue.
  it('does not render the non-functional add-deal (+) button', () => {
    render(<CRMDealsSection senderEmail="person@example.com" />);
    expect(screen.queryByTitle('crm.createDeal')).not.toBeInTheDocument();
  });

  it('still renders the Deals section header', () => {
    render(<CRMDealsSection senderEmail="person@example.com" />);
    expect(screen.getByText('crm.deals')).toBeInTheDocument();
  });
});
