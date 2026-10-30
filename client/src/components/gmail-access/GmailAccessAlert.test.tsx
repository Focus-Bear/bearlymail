import { fireEvent, render, screen } from '@testing-library/react';

import { API_URL } from 'config/api';
import { GOOGLE_OAUTH_START_PATH } from 'constants/strings';

import { GMAIL_ACCESS_ALERT_LAYOUT, GmailAccessAlert } from './GmailAccessAlert';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('GmailAccessAlert', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: { href: '' } });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
  });

  it('says why Gmail cannot be read, as an alert', () => {
    render(<GmailAccessAlert layout={GMAIL_ACCESS_ALERT_LAYOUT.BANNER} />);

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('gmail.accessIssueTitle')).toBeTruthy();
    expect(screen.getByText('gmail.accessIssueMessage')).toBeTruthy();
  });

  it('restarts Google sign-in when Reconnect Google is clicked', () => {
    render(<GmailAccessAlert layout={GMAIL_ACCESS_ALERT_LAYOUT.PANEL} />);

    fireEvent.click(screen.getByText('gmail.reconnectGoogle'));

    expect(window.location.href).toBe(`${API_URL}${GOOGLE_OAUTH_START_PATH}`);
  });
});
