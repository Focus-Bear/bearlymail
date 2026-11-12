import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import { peekPostLoginPath } from 'utils/postLoginRedirect';

import OAuthConsent from './OAuthConsent';

vi.mock('axios', () => ({ default: { get: vi.fn(), post: vi.fn(), isAxiosError: vi.fn() } }));
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

const DECISION_URL = `http://api.test/oauth/consent-requests/${REQUEST_ID}/decision`;
const STEP_UP_URL = 'http://api.test/auth/step-up';
const REDIRECT = { data: { redirectUrl: 'https://claude.ai/api/mcp/auth_callback?code=x' } };

function unauthorized(data: unknown) {
  return Object.assign(new Error('401'), { response: { status: 401, data } });
}

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
    vi.mocked(axios.isAxiosError).mockReset().mockReturnValue(true);
    vi.mocked(axios.post)
      .mockReset()
      .mockImplementation(async (url: string) => (url === STEP_UP_URL ? { data: { step_up_token: 'step-up-1' } } : REDIRECT));
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
      expect(axios.post).toHaveBeenCalledWith(
        DECISION_URL,
        { approve: true, allowSend: true },
        { headers: { 'X-Step-Up-Token': 'step-up-1' } }
      )
    );
    expect(assign).toHaveBeenCalledWith('https://claude.ai/api/mcp/auth_callback?code=x');
  });

  it('denies', async () => {
    renderAt(`/oauth/consent?request=${REQUEST_ID}`);
    fireEvent.click(await screen.findByTestId('oauth-consent-deny'));
    await waitFor(() =>
      expect(axios.post).toHaveBeenCalledWith(DECISION_URL, { approve: false, allowSend: false }, { headers: {} })
    );
    expect(axios.post).not.toHaveBeenCalledWith(STEP_UP_URL, expect.anything());
  });

  describe('for a password user', () => {
    function challengeUntilPassword(correctPassword: string) {
      vi.mocked(axios.post).mockImplementation(async (url: string, body?: unknown) => {
        if (url !== STEP_UP_URL) {
          return REDIRECT;
        }
        const { password } = body as { password?: string };
        if (!password) {
          throw unauthorized({ requiresPassword: true });
        }
        if (password !== correctPassword) {
          throw unauthorized({});
        }
        return { data: { step_up_token: 'step-up-2' } };
      });
    }

    async function enterPassword(password: string) {
      const dialog = await screen.findByRole('dialog');
      const input = dialog.querySelector('input') as HTMLInputElement;
      fireEvent.change(input, { target: { value: password } });
      fireEvent.submit(input.closest('form') as HTMLFormElement);
    }

    it('confirms the password before approving', async () => {
      challengeUntilPassword('hunter2');
      renderAt(`/oauth/consent?request=${REQUEST_ID}`);
      fireEvent.click(await screen.findByTestId('oauth-consent-allow'));

      await enterPassword('hunter2');

      await waitFor(() =>
        expect(axios.post).toHaveBeenCalledWith(DECISION_URL, expect.objectContaining({ approve: true }), {
          headers: { 'X-Step-Up-Token': 'step-up-2' },
        })
      );
      expect(assign).toHaveBeenCalledWith('https://claude.ai/api/mcp/auth_callback?code=x');
    });

    it('shows an error on a wrong password and approves nothing', async () => {
      challengeUntilPassword('hunter2');
      renderAt(`/oauth/consent?request=${REQUEST_ID}`);
      fireEvent.click(await screen.findByTestId('oauth-consent-allow'));

      await enterPassword('wrong');

      expect(await screen.findByText('stepUp.invalidPassword')).toBeInTheDocument();
      expect(axios.post).not.toHaveBeenCalledWith(DECISION_URL, expect.anything(), expect.anything());
      expect(assign).not.toHaveBeenCalled();
    });
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
