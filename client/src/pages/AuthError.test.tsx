import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen } from '@testing-library/react';

import { startGoogleReconnect } from 'components/gmail-access/GmailAccessAlert';
import { ERROR_TYPE_MISSING_GMAIL_PERMISSION } from 'constants/strings';

import AuthError from './AuthError';

vi.mock('components/gmail-access/GmailAccessAlert', () => ({ startGoogleReconnect: vi.fn() }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}));

const renderAuthError = (search: string) =>
  render(
    <MemoryRouter initialEntries={[`/auth-error?${search}`]}>
      <AuthError />
    </MemoryRouter>
  );

describe('AuthError', () => {
  it('explains how to grant Gmail access instead of offering the waitlist', () => {
    renderAuthError(
      new URLSearchParams({ error: 'auth_failed', message: 'raw', type: ERROR_TYPE_MISSING_GMAIL_PERMISSION }).toString()
    );

    expect(screen.getByText('auth.errors.missingGmailPermission.title')).toBeInTheDocument();
    expect(screen.getByText('auth.errors.missingGmailPermission.description')).toBeInTheDocument();
    expect(screen.getByText('auth.backToLogin')).toBeInTheDocument();
    expect(screen.queryByText('auth.joinWaitlist')).not.toBeInTheDocument();
  });

  it('offers a button that goes straight back to Google to allow Gmail access', () => {
    renderAuthError(
      new URLSearchParams({ error: 'auth_failed', message: 'raw', type: ERROR_TYPE_MISSING_GMAIL_PERMISSION }).toString()
    );

    fireEvent.click(screen.getByText('auth.errors.missingGmailPermission.grantButton'));

    expect(startGoogleReconnect).toHaveBeenCalledTimes(1);
  });

  it('does not offer the Gmail button for other auth errors', () => {
    renderAuthError(new URLSearchParams({ error: 'auth_failed', message: 'raw', type: 'auth_error' }).toString());

    expect(screen.queryByText('auth.errors.missingGmailPermission.grantButton')).not.toBeInTheDocument();
  });
});
