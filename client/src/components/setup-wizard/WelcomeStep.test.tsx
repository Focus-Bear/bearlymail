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
const OPTIONAL_TITLE = 'setupWizard.welcome.permissions.optionalTitle';

function renderWithUser(user: Partial<User>) {
  mockedUseAuth.mockReturnValue({ user: { id: 'user-1', email: 'a@example.com', ...user } });
  return render(<WelcomeStep onComplete={vi.fn()} refreshUser={vi.fn()} />);
}

describe('WelcomeStep — Google permissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedAxios.get.mockResolvedValue({ data: [] });
  });

  it('shows the inbox as connected when every permission was granted', () => {
    renderWithUser({ missingGooglePermissions: [] });

    expect(screen.getByText(CONNECTED_TITLE)).toBeInTheDocument();
    expect(screen.getByText('setupWizard.welcome.doneTag')).toBeInTheDocument();
    expect(screen.queryByText(GMAIL_TITLE)).not.toBeInTheDocument();
    expect(screen.queryByText(OPTIONAL_TITLE)).not.toBeInTheDocument();
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

  it('keeps the inbox connected but notes skipped calendar and contacts access', () => {
    renderWithUser({ missingGooglePermissions: [GOOGLE_PERMISSION_CALENDAR, GOOGLE_PERMISSION_CONTACTS] });

    expect(screen.getByText(CONNECTED_TITLE)).toBeInTheDocument();
    expect(screen.getByText(OPTIONAL_TITLE)).toBeInTheDocument();
    expect(screen.getByText('setupWizard.welcome.permissions.optionalCalendar')).toBeInTheDocument();
    expect(screen.getByText('setupWizard.welcome.permissions.optionalContacts')).toBeInTheDocument();

    fireEvent.click(screen.getByText('setupWizard.welcome.permissions.optionalButton'));
    expect(startGoogleReconnect).toHaveBeenCalledTimes(1);
  });

  it('lists only the optional permission that was skipped', () => {
    renderWithUser({ missingGooglePermissions: [GOOGLE_PERMISSION_CONTACTS] });

    expect(screen.getByText('setupWizard.welcome.permissions.optionalContacts')).toBeInTheDocument();
    expect(screen.queryByText('setupWizard.welcome.permissions.optionalCalendar')).not.toBeInTheDocument();
  });
});
