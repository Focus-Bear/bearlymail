import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import { peekPostLoginPath } from 'utils/postLoginRedirect';

import OAuthConsent from './OAuthConsent';

vi.mock('axios', () => ({ default: { get: vi.fn(), post: vi.fn(), isAxiosError: () => false } }));
vi.mock('config/api', () => ({ API_URL: 'http://api.test' }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => (options ? `${key}:${JSON.stringify(options)}` : key),
  }),
}));

const mockUseAuth = vi.fn();
vi.mock('contexts/AuthContext', () => ({ useAuth: () => mockUseAuth() }));

const REQUEST_ID = '22222222-2222-4222-8222-222222222222';
const CONSENT_REQUEST = {
  id: REQUEST_ID,
  clientName: 'Claude',
  clientId: 'https://claude.ai/oauth/mcp-client-metadata',
  clientHost: 'claude.ai',
  redirectHost: 'claude.ai',
  isLoopbackRedirect: false,
  canRequestSend: true,
  expiresAt: '2026-11-04T01:00:00Z',
};

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/oauth/consent" element={<OAuthConsent />} />
        <Route path="/login" element={<div>login page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('OAuthConsent', () => {
  const assign = vi.fn();

  beforeEach(() => {
    sessionStorage.clear();
    mockUseAuth.mockReturnValue({ user: { id: 'u1', email: 'me@example.com' }, loading: false });
    vi.mocked(axios.get).mockReset().mockResolvedValue({ data: CONSENT_REQUEST });
    vi.mocked(axios.post).mockReset().mockResolvedValue({ data: { redirectUrl: 'https://claude.ai/api/mcp/auth_callback?code=x' } });
    assign.mockReset();
    Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, assign } });
  });

  it('sends a logged-out user to login and remembers to come back', async () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    renderAt(`/oauth/consent?request=${REQUEST_ID}`);
    expect(await screen.findByText('login page')).toBeInTheDocument();
    expect(peekPostLoginPath()).toBe(`/oauth/consent?request=${REQUEST_ID}`);
    expect(axios.get).not.toHaveBeenCalled();
  });

  it('shows who is asking and where the code goes, read-only by default', async () => {
    renderAt(`/oauth/consent?request=${REQUEST_ID}`);
    expect(await screen.findByTestId('oauth-consent')).toBeInTheDocument();
    expect(axios.get).toHaveBeenCalledWith(`http://api.test/oauth/consent-requests/${REQUEST_ID}`);
    expect(screen.getByTestId('oauth-consent-redirect-host')).toHaveTextContent('claude.ai');
    expect(screen.getByTestId('oauth-consent-scope-read')).toBeChecked();
    expect(screen.queryByTestId('oauth-consent-loopback-warning')).not.toBeInTheDocument();
  });

  it('approves with sending when the user picks read and send, then returns to Claude', async () => {
    renderAt(`/oauth/consent?request=${REQUEST_ID}`);
    fireEvent.click(await screen.findByTestId('oauth-consent-scope-send'));
    fireEvent.click(screen.getByTestId('oauth-consent-allow'));
    await waitFor(() =>
      expect(axios.post).toHaveBeenCalledWith(`http://api.test/oauth/consent-requests/${REQUEST_ID}/decision`, {
        approve: true,
        allowSend: true,
      })
    );
    expect(assign).toHaveBeenCalledWith('https://claude.ai/api/mcp/auth_callback?code=x');
  });

  it('denies', async () => {
    renderAt(`/oauth/consent?request=${REQUEST_ID}`);
    fireEvent.click(await screen.findByTestId('oauth-consent-deny'));
    await waitFor(() =>
      expect(axios.post).toHaveBeenCalledWith(expect.stringContaining('/decision'), { approve: false, allowSend: false })
    );
  });

  it('warns about loopback redirects and disables send when it was not requested', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: { ...CONSENT_REQUEST, isLoopbackRedirect: true, canRequestSend: false, redirectHost: 'localhost' },
    });
    renderAt(`/oauth/consent?request=${REQUEST_ID}`);
    expect(await screen.findByTestId('oauth-consent-loopback-warning')).toBeInTheDocument();
    expect(screen.getByTestId('oauth-consent-scope-send')).toBeDisabled();
  });

  it('explains an expired request', async () => {
    vi.mocked(axios.get).mockRejectedValue(new Error('404'));
    renderAt(`/oauth/consent?request=${REQUEST_ID}`);
    expect(await screen.findByText('oauthConsent.expired')).toBeInTheDocument();
  });

  it('clears the remembered path once the user is back', async () => {
    sessionStorage.setItem('bearlymail_post_login_path', `/oauth/consent?request=${REQUEST_ID}`);
    renderAt(`/oauth/consent?request=${REQUEST_ID}`);
    await screen.findByTestId('oauth-consent');
    expect(peekPostLoginPath()).toBeNull();
  });
});
