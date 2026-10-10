import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';

import { EmailAccountsSection } from './EmailAccountsSection';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('./ProviderSelectionModal', () => ({
  ProviderSelectionModal: () => null,
}));

vi.mock('axios', () => ({
  default: {
    post: vi.fn(),
    delete: vi.fn(),
    isAxiosError: vi.fn(),
  },
}));
const mockedAxios = axios as unknown as {
  post: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  isAxiosError: ReturnType<typeof vi.fn>;
};

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

describe('EmailAccountsSection disconnect step-up flow (issue #257)', () => {
  const twoAccountProps = {
    ...baseProps,
    onFetchData: vi.fn().mockResolvedValue(undefined),
    zohoAccounts: [
      { id: 'z1', email: 'primary@zoho.com', isPrimary: true },
      { id: 'z2', email: 'secondary@zoho.com' },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockedAxios.isAxiosError.mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('acquires a step-up token then sends DELETE with it (OAuth user, no logout)', async () => {
    mockedAxios.post.mockResolvedValue({ data: { step_up_token: 'tok-123' } });
    mockedAxios.delete.mockResolvedValue({ data: { success: true } });

    render(<EmailAccountsSection {...twoAccountProps} />);
    fireEvent.click(screen.getAllByText('settings.gmail.disconnect')[1]);

    await waitFor(() => expect(mockedAxios.delete).toHaveBeenCalled());

    expect(mockedAxios.post).toHaveBeenCalledWith(expect.stringContaining('/auth/step-up'), {});
    expect(mockedAxios.delete).toHaveBeenCalledWith(
      expect.stringContaining('/zoho-accounts/z2'),
      { headers: { 'X-Step-Up-Token': 'tok-123' } }
    );
    await waitFor(() => expect(twoAccountProps.onFetchData).toHaveBeenCalled());
  });

  it('opens the password modal when the user has a password (requiresPassword 401)', async () => {
    mockedAxios.post.mockRejectedValue({
      response: { status: 401, data: { requiresPassword: true } },
    });

    render(<EmailAccountsSection {...twoAccountProps} />);
    fireEvent.click(screen.getAllByText('settings.gmail.disconnect')[1]);

    // The step-up modal renders its confirm button; DELETE must not fire yet.
    await waitFor(() => expect(screen.getByText('stepUp.confirm')).toBeInTheDocument());
    expect(mockedAxios.delete).not.toHaveBeenCalled();
  });
});
