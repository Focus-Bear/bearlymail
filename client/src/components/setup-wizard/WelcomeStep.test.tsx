import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import axios from 'axios';

import { startGoogleReconnect } from 'components/gmail-access/GmailAccessAlert';
import {
  GMAIL_ACCESS_ISSUE_MISSING,
  GMAIL_ACCESS_ISSUE_REVOKED,
  GOOGLE_PERMISSION_CALENDAR,
  GOOGLE_PERMISSION_CONTACTS,
  GOOGLE_PERMISSION_GMAIL,
} from 'constants/strings';
import { useAuth,User } from 'contexts/AuthContext';

import { WelcomeStep } from './WelcomeStep';

vi.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('contexts/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('components/gmail-access/GmailAccessAlert', () => ({ startGoogleReconnect: vi.fn() }));

const mockedUseAuth = useAuth as unknown as ReturnType<typeof vi.fn>;

const CONNECTED_TITLE = 'setupWizard.welcome.prop1Title';
const GMAIL_TITLE = 'setupWizard.welcome.permissions.gmailTitle';
const NO_MAILBOX_TITLE = 'setupWizard.welcome.noMailboxTitle';
const CONNECTED_ACCOUNTS_PATH = '/emails/connected-accounts';
const NO_MAILBOX_REFUSAL = { response: { status: 403, data: { error: 'EMAIL_PROVIDER_REQUIRED' } } };

function renderWithUser(user: Partial<User>) {
  mockedUseAuth.mockReturnValue({ user: { id: 'user-1', email: 'a@example.com', ...user } });
  return render(<WelcomeStep onComplete={vi.fn()} refreshUser={vi.fn()} />);
}

describe('WelcomeStep — Google permissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedAxios.get.mockResolvedValue({ data: [] });
  });

  it('shows the inbox as connected when every permission was granted', async () => {
    renderWithUser({ missingGooglePermissions: [] });

    expect(await screen.findByText(CONNECTED_TITLE)).toBeInTheDocument();
    expect(screen.getByText('setupWizard.welcome.doneTag')).toBeInTheDocument();
    expect(screen.queryByText(GMAIL_TITLE)).not.toBeInTheDocument();
  });

  it('replaces "Your inbox is connected" with a warning when Gmail was left unticked', () => {
    renderWithUser({ missingGooglePermissions: [GOOGLE_PERMISSION_GMAIL] });

    expect(screen.getByRole('alert')).toHaveTextContent(GMAIL_TITLE);
    expect(screen.getByText('setupWizard.welcome.permissions.gmailBody')).toBeInTheDocument();
    expect(screen.queryByText(CONNECTED_TITLE)).not.toBeInTheDocument();
    expect(screen.queryByText('setupWizard.welcome.doneTag')).not.toBeInTheDocument();
  });

  it('warns about Gmail when a sync found the grant lacks Gmail access', () => {
    renderWithUser({ gmailAccessIssue: GMAIL_ACCESS_ISSUE_MISSING });

    expect(screen.getByText(GMAIL_TITLE)).toBeInTheDocument();
    expect(screen.queryByText(CONNECTED_TITLE)).not.toBeInTheDocument();
  });

  it('explains a revoked grant differently from unticked boxes', () => {
    renderWithUser({ gmailAccessIssue: GMAIL_ACCESS_ISSUE_REVOKED });

    expect(screen.getByText('setupWizard.welcome.permissions.gmailBodyRevoked')).toBeInTheDocument();
  });

  it('sends the user back to Google to allow Gmail', () => {
    renderWithUser({ missingGooglePermissions: [GOOGLE_PERMISSION_GMAIL] });

    fireEvent.click(screen.getByText('setupWizard.welcome.permissions.gmailButton'));

    expect(startGoogleReconnect).toHaveBeenCalledTimes(1);
  });

  it('keeps the inbox connected without mentioning calendar or contacts, which are asked for later', async () => {
    renderWithUser({ missingGooglePermissions: [GOOGLE_PERMISSION_CALENDAR, GOOGLE_PERMISSION_CONTACTS] });

    expect(await screen.findByText(CONNECTED_TITLE)).toBeInTheDocument();
    expect(screen.getByText('setupWizard.welcome.doneTag')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /permission/i })).not.toBeInTheDocument();
  });
});

describe('WelcomeStep — no email is read before the terms are accepted', () => {
  const ACCEPT_CONSENT_PATH = '/users/accept-consent';

  beforeEach(() => {
    vi.clearAllMocks();
    mockedAxios.get.mockResolvedValue({ data: [] });
    mockedAxios.post.mockResolvedValue({ data: {} });
  });

  // The connected-accounts check only lists BearlyMail's own account rows; it reads no email.
  function requestedPaths(): string[] {
    return [...mockedAxios.get.mock.calls, ...mockedAxios.post.mock.calls]
      .map(([url]) => String(url))
      .filter(path => !path.endsWith(CONNECTED_ACCOUNTS_PATH));
  }

  it('makes no sync, scan or analysis request on step 1 and keeps Continue disabled', () => {
    renderWithUser({ missingGooglePermissions: [] });

    expect(screen.getByText('setupWizard.welcome.getStarted').closest('button')).toBeDisabled();
    expect(mockedAxios.post).not.toHaveBeenCalled();
    expect(requestedPaths().some(path => /emails|onboarding|context\/analyze/.test(path))).toBe(false);
  });

  it('records the acceptance (which starts the first sync server-side) only once the box is ticked', async () => {
    const onComplete = vi.fn();
    mockedUseAuth.mockReturnValue({ user: { id: 'user-1', email: 'a@example.com' } });
    render(<WelcomeStep onComplete={onComplete} refreshUser={vi.fn().mockResolvedValue(undefined)} />);

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByText('setupWizard.welcome.getStarted'));

    await vi.waitFor(() => expect(onComplete).toHaveBeenCalled());
    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    expect(mockedAxios.post.mock.calls[0][0]).toContain(ACCEPT_CONSENT_PATH);
    expect(mockedAxios.post.mock.calls[0][1]).toEqual({ termsAccepted: true, privacyAccepted: true });
  });
});

describe('WelcomeStep — no email account connected (#442)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedAxios.get.mockImplementation(url =>
      String(url).endsWith(CONNECTED_ACCOUNTS_PATH) ? Promise.reject(NO_MAILBOX_REFUSAL) : Promise.resolve({ data: [] })
    );
  });

  it('offers to connect an account instead of saying the inbox is connected', async () => {
    renderWithUser({ missingGooglePermissions: [] });

    expect(await screen.findByText(NO_MAILBOX_TITLE)).toBeInTheDocument();
    expect(screen.getByTestId('connect-mailbox-button')).toHaveTextContent('connectMailbox.button');
    expect(screen.queryByText(CONNECTED_TITLE)).not.toBeInTheDocument();
    expect(screen.queryByText('setupWizard.welcome.doneTag')).not.toBeInTheDocument();
  });

  it('still says connected when the check fails for another reason', async () => {
    mockedAxios.get.mockRejectedValue({ response: { status: 500, data: {} } });
    renderWithUser({ missingGooglePermissions: [] });

    expect(await screen.findByText(CONNECTED_TITLE)).toBeInTheDocument();
    expect(screen.queryByText(NO_MAILBOX_TITLE)).not.toBeInTheDocument();
  });
});
