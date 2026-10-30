import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';

import { ImapConnectModal } from './ImapConnectModal';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('axios', () => ({
  default: { post: vi.fn(), isAxiosError: vi.fn() },
}));
const mockedAxios = axios as unknown as {
  post: ReturnType<typeof vi.fn>;
  isAxiosError: ReturnType<typeof vi.fn>;
};

function rejectWith(code: string, detail = 'server said no') {
  mockedAxios.isAxiosError.mockReturnValue(true);
  mockedAxios.post.mockRejectedValue({
    response: { status: 400, data: { failure: { protocol: 'imap', code, detail } } },
  });
}

function fillCredentials() {
  fireEvent.change(screen.getByLabelText('settings.imap.email'), { target: { value: 'hello@mybusiness.com.au' } });
  fireEvent.change(screen.getByLabelText('settings.imap.password'), { target: { value: 'correct-horse' } });
}

describe('ImapConnectModal', () => {
  beforeEach(() => vi.clearAllMocks());

  it('connects with just an email address and password (no server settings sent)', async () => {
    const onConnected = vi.fn();
    mockedAxios.post.mockResolvedValue({ data: { account: { id: 'i1' } } });
    render(<ImapConnectModal isOpen onClose={vi.fn()} onConnected={onConnected} />);

    expect(screen.queryByLabelText('settings.imap.host')).not.toBeInTheDocument();
    fillCredentials();
    fireEvent.click(screen.getByText('settings.imap.connect'));

    await waitFor(() => expect(onConnected).toHaveBeenCalled());
    const [, payload] = mockedAxios.post.mock.calls[0];
    expect(payload).toEqual({ email: 'hello@mybusiness.com.au', password: 'correct-horse' });
  });

  it('explains a wrong password in plain words, with details tucked away', async () => {
    rejectWith('auth_failed', 'AUTHENTICATIONFAILED');
    render(<ImapConnectModal isOpen onClose={vi.fn()} onConnected={vi.fn()} />);
    fillCredentials();
    fireEvent.click(screen.getByText('settings.imap.connect'));

    expect(await screen.findByText('settings.imap.errors.auth_failed_imap')).toBeInTheDocument();
    expect(screen.queryByText('AUTHENTICATIONFAILED')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('settings.imap.showDetails'));
    expect(screen.getByText('AUTHENTICATIONFAILED')).toBeInTheDocument();
  });

  it('offers the Google sign-in when the address is Google mail', async () => {
    rejectWith('use_gmail');
    const onUseProvider = vi.fn();
    render(<ImapConnectModal isOpen onClose={vi.fn()} onConnected={vi.fn()} onUseProvider={onUseProvider} />);
    fillCredentials();
    fireEvent.click(screen.getByText('settings.imap.connect'));

    fireEvent.click(await screen.findByText('settings.imap.useProvider.gmail'));
    expect(onUseProvider).toHaveBeenCalledWith('gmail');
  });

  it('lets the user type the server settings when they can not be found', async () => {
    rejectWith('server_not_found');
    mockedAxios.post.mockRejectedValueOnce({
      response: { status: 400, data: { failure: { protocol: 'imap', code: 'server_not_found', detail: '' } } },
    });
    render(<ImapConnectModal isOpen onClose={vi.fn()} onConnected={vi.fn()} />);
    fillCredentials();
    fireEvent.click(screen.getByText('settings.imap.connect'));
    expect(await screen.findByText('settings.imap.errors.server_not_found')).toBeInTheDocument();

    fireEvent.click(screen.getByText('settings.imap.enterManually'));
    expect(screen.getAllByLabelText('settings.imap.host')[0]).toHaveValue('mail.mybusiness.com.au');
    mockedAxios.post.mockResolvedValue({ data: { account: { id: 'i1' } } });
    fireEvent.click(screen.getByText('settings.imap.connect'));
    await waitFor(() =>
      expect(mockedAxios.post.mock.calls[1][1]).toMatchObject({ imapHost: 'mail.mybusiness.com.au', imapPort: 993 })
    );
  });

  it('disables Connect until an address and password are filled in', () => {
    render(<ImapConnectModal isOpen onClose={vi.fn()} onConnected={vi.fn()} />);
    expect(screen.getByText('settings.imap.connect')).toBeDisabled();
  });
});
