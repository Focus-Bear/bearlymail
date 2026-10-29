import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';

import { ImapConnectModal } from './ImapConnectModal';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string>) => (values?.host ? `${key}:${values.host}` : key),
  }),
}));

vi.mock('axios', () => ({
  default: { get: vi.fn(), post: vi.fn(), isAxiosError: vi.fn() },
}));
const mockedAxios = axios as unknown as {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  isAxiosError: ReturnType<typeof vi.fn>;
};

function fillCredentials() {
  fireEvent.change(screen.getByLabelText('settings.imap.email'), { target: { value: 'friend@crazy.test' } });
  fireEvent.blur(screen.getByLabelText('settings.imap.email'));
  fireEvent.change(screen.getByLabelText('settings.imap.password'), { target: { value: 'correct-horse' } });
}

describe('ImapConnectModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedAxios.get.mockResolvedValue({ data: { servers: null } });
  });

  it('suggests mail.<domain> from the address and connects with it', async () => {
    const onConnected = vi.fn();
    mockedAxios.post.mockResolvedValue({ data: { account: { id: 'i1', email: 'friend@crazy.test' } } });
    render(<ImapConnectModal isOpen onClose={vi.fn()} onConnected={onConnected} />);

    fillCredentials();
    await waitFor(() => expect(screen.getByText('settings.imap.serverSummary:mail.crazy.test')).toBeInTheDocument());
    fireEvent.click(screen.getByText('settings.imap.connect'));

    await waitFor(() => expect(onConnected).toHaveBeenCalled());
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining('/imap-accounts/connect'),
      expect.objectContaining({
        email: 'friend@crazy.test',
        password: 'correct-horse',
        imapHost: 'mail.crazy.test',
        imapPort: 993,
        smtpPort: 465,
      })
    );
  });

  it('explains a rejected password from a failed test', async () => {
    mockedAxios.post.mockResolvedValue({
      data: { ok: false, failure: { protocol: 'imap', code: 'auth_failed', detail: 'AUTHENTICATIONFAILED' } },
    });
    render(<ImapConnectModal isOpen onClose={vi.fn()} onConnected={vi.fn()} />);

    fillCredentials();
    fireEvent.click(screen.getByText('settings.imap.test'));

    expect(await screen.findByText('settings.imap.errors.auth_failed_imap')).toBeInTheDocument();
    expect(screen.getByText('AUTHENTICATIONFAILED')).toBeInTheDocument();
  });

  it('keeps hand-edited server settings instead of re-suggesting them', async () => {
    render(<ImapConnectModal isOpen onClose={vi.fn()} onConnected={vi.fn()} />);
    fireEvent.click(screen.getByText('settings.imap.showAdvanced'));
    fireEvent.change(screen.getAllByLabelText('settings.imap.host')[0], { target: { value: 's123.crazydomains.com' } });

    fillCredentials();

    expect(mockedAxios.get).not.toHaveBeenCalled();
    expect(screen.getAllByLabelText('settings.imap.host')[0]).toHaveValue('s123.crazydomains.com');
  });

  it('disables connecting until an address, password and servers are filled in', () => {
    render(<ImapConnectModal isOpen onClose={vi.fn()} onConnected={vi.fn()} />);
    expect(screen.getByText('settings.imap.connect')).toBeDisabled();
  });
});
