import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import { captureEvent } from 'utils/posthog';

import { API_URL } from 'config/api';
import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import {
  GOOGLE_PERMISSION_CALENDAR,
  GOOGLE_PERMISSION_CONTACTS,
  GOOGLE_PERMISSION_URL_PATH,
  GooglePermissionGroup,
} from 'constants/strings';
import { useAuth } from 'contexts/AuthContext';

import { ConnectCalendarPrompt } from './ConnectCalendarPrompt';
import { ImportGoogleContactsBadge } from './ImportGoogleContactsBadge';

vi.mock('axios', () => ({ default: { get: vi.fn() } }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('utils/posthog', () => ({ captureEvent: vi.fn() }));
vi.mock('contexts/AuthContext', () => ({ useAuth: vi.fn() }));
const showError = vi.fn();
vi.mock('contexts/NotificationContext', () => ({ useNotifications: () => ({ showError }) }));

const GOOGLE_CONSENT_URL = 'https://accounts.google.com/o/oauth2/v2/auth?scope=contacts';

const givenMissing = (missingGooglePermissions: GooglePermissionGroup[] | undefined) =>
  vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1', email: 'a@b.c', missingGooglePermissions } } as never);

describe('Google permission prompts', () => {
  const assign = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('location', { ...window.location, href: 'http://app.test/crm/contacts?q=x', assign });
    vi.mocked(axios.get).mockResolvedValue({ data: { url: GOOGLE_CONSENT_URL } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('offers to import Gmail contacts when contacts were not granted', async () => {
    givenMissing([GOOGLE_PERMISSION_CONTACTS]);
    render(<ImportGoogleContactsBadge />);

    expect(screen.getByText('googlePermissions.contacts.message')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'googlePermissions.contacts.action' }));

    await waitFor(() => expect(assign).toHaveBeenCalledWith(GOOGLE_CONSENT_URL));
    expect(axios.get).toHaveBeenCalledWith(`${API_URL}${GOOGLE_PERMISSION_URL_PATH}`, {
      params: { permission: GOOGLE_PERMISSION_CONTACTS, returnTo: '/crm/contacts?q=x' },
    });
    expect(captureEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.GOOGLE_PERMISSION_REQUESTED, {
      permission: GOOGLE_PERMISSION_CONTACTS,
    });
  });

  it('offers to connect the calendar when calendar was not granted', () => {
    givenMissing([GOOGLE_PERMISSION_CALENDAR]);
    render(<ConnectCalendarPrompt />);

    expect(screen.getByTestId('connect-calendar-prompt')).toBeInTheDocument();
  });

  it.each([
    ['the permission was granted', [GOOGLE_PERMISSION_CALENDAR] as GooglePermissionGroup[]],
    ['the grant is unknown or the user is not on Google', undefined],
  ])('shows no contacts badge when %s', (_label, missing) => {
    givenMissing(missing);
    render(<ImportGoogleContactsBadge />);

    expect(screen.queryByTestId('import-google-contacts-badge')).not.toBeInTheDocument();
  });

  it('says so and re-enables the button when Google cannot be opened', async () => {
    givenMissing([GOOGLE_PERMISSION_CALENDAR]);
    vi.mocked(axios.get).mockRejectedValue(new Error('network'));
    render(<ConnectCalendarPrompt />);

    const button = screen.getByRole('button', { name: 'googlePermissions.calendar.action' });
    fireEvent.click(button);

    await waitFor(() => expect(showError).toHaveBeenCalledWith('googlePermissions.startError'));
    expect(button).not.toBeDisabled();
    expect(assign).not.toHaveBeenCalled();
  });
});
