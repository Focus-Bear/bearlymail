import React from 'react';
import { render, screen } from '@testing-library/react';

import { EmailAccountsSection } from './EmailAccountsSection';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('./ProviderSelectionModal', () => ({
  ProviderSelectionModal: () => null,
}));

const baseProps = {
  googleAccounts: [],
  office365Accounts: [],
  zohoAccounts: [],
  appleMailAccounts: [],
  appleMailAvailable: false,
  onFetchData: vi.fn().mockResolvedValue(undefined),
};

describe('EmailAccountsSection disconnect availability', () => {
  it('hides Disconnect and shows a hint when only one account is connected', () => {
    render(<EmailAccountsSection {...baseProps} zohoAccounts={[{ id: 'z1', email: 'solo@zoho.com' }]} />);

    expect(screen.queryByText('settings.gmail.disconnect')).not.toBeInTheDocument();
    expect(screen.getByText('settings.emailAccounts.lastAccountHint')).toBeInTheDocument();
  });

  it('shows Disconnect and hides the hint when more than one account is connected', () => {
    render(
      <EmailAccountsSection
        {...baseProps}
        googleAccounts={[{ id: 'g1', email: 'a@gmail.com' }]}
        zohoAccounts={[{ id: 'z1', email: 'b@zoho.com' }]}
      />
    );

    expect(screen.getAllByText('settings.gmail.disconnect')).toHaveLength(2);
    expect(screen.queryByText('settings.emailAccounts.lastAccountHint')).not.toBeInTheDocument();
  });

  it('does not show the hint when the only account is an SSO account', () => {
    render(
      <EmailAccountsSection {...baseProps} googleAccounts={[{ id: 'g1', email: 'sso@gmail.com', isSSO: true }]} />
    );

    expect(screen.queryByText('settings.gmail.disconnect')).not.toBeInTheDocument();
    expect(screen.queryByText('settings.emailAccounts.lastAccountHint')).not.toBeInTheDocument();
  });
});
