import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import { captureEvent } from 'utils/posthog';

import { ANALYTICS_EVENTS } from 'constants/analytics-events';

import { FocusBearConnectionSection } from './FocusBearConnectionSection';

vi.mock('axios', () => ({ default: { get: vi.fn(), delete: vi.fn() } }));
vi.mock('config/api', () => ({ API_URL: 'http://api.test' }));
vi.mock('utils/posthog', () => ({ captureEvent: vi.fn() }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const CONNECTION_URL = 'http://api.test/focus-bear/connection';
const CONNECT_URL = 'http://api.test/focus-bear/oauth/connect-url';
const SIGN_IN_URL = 'https://auth.focusbear.example/authorize?state=s';

const NOT_CONNECTED = { connected: false, method: null, oauthAvailable: true };
const SIGNED_IN = { connected: true, method: 'oauth', oauthAvailable: true };
const PASTED_TOKEN = { connected: true, method: 'pasted_token', oauthAvailable: true };

function mockConnection(connection: unknown) {
  vi.mocked(axios.get).mockImplementation(async (url: string) =>
    url === CONNECT_URL ? { data: { url: SIGN_IN_URL } } : { data: connection }
  );
}

function renderSection() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <FocusBearConnectionSection />
    </QueryClientProvider>
  );
}

describe('FocusBearConnectionSection', () => {
  const assign = vi.fn();
  const originalLocation = window.location;

  beforeEach(() => {
    vi.mocked(axios.get).mockReset();
    vi.mocked(axios.delete).mockReset().mockResolvedValue({ data: NOT_CONNECTED });
    vi.mocked(captureEvent).mockReset();
    assign.mockReset();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, assign, search: '', pathname: '/settings', hash: '#focus-bear' },
    });
    vi.spyOn(window.history, 'replaceState').mockImplementation(() => undefined);
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
  });

  it('offers Connect Focus Bear, with no token field, when not connected', async () => {
    mockConnection(NOT_CONNECTED);
    renderSection();

    expect(await screen.findByText('settings.focusBear.notConnected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'settings.focusBear.connect' })).toBeEnabled();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(document.querySelector('input')).toBeNull();
  });

  it('sends the browser to the Focus Bear sign-in URL the server returns', async () => {
    mockConnection(NOT_CONNECTED);
    renderSection();

    await screen.findByText('settings.focusBear.notConnected');
    fireEvent.click(screen.getByRole('button', { name: 'settings.focusBear.connect' }));

    await waitFor(() => expect(assign).toHaveBeenCalledWith(SIGN_IN_URL));
    expect(axios.get).toHaveBeenCalledWith(CONNECT_URL);
  });

  it('says so, and lets the user try again, when the sign-in cannot start', async () => {
    vi.mocked(axios.get).mockImplementation(async (url: string) => {
      if (url === CONNECT_URL) {
throw new Error('503');
}
      return { data: NOT_CONNECTED };
    });
    renderSection();

    await screen.findByText('settings.focusBear.notConnected');
    fireEvent.click(screen.getByRole('button', { name: 'settings.focusBear.connect' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('settings.focusBear.startError');
    expect(screen.getByRole('button', { name: 'settings.focusBear.connect' })).toBeEnabled();
  });

  it('shows the connected state with Disconnect, and no Connect, once signed in', async () => {
    mockConnection(SIGNED_IN);
    renderSection();

    expect(await screen.findByText('settings.focusBear.connected')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'settings.focusBear.connect' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'settings.focusBear.disconnect' }));

    await waitFor(() => expect(axios.delete).toHaveBeenCalledWith(CONNECTION_URL));
    expect(await screen.findByText('settings.focusBear.notConnected')).toBeInTheDocument();
    expect(captureEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.FOCUS_BEAR_DISCONNECTED);
  });

  it('keeps a pasted token working while offering to switch to sign-in', async () => {
    mockConnection(PASTED_TOKEN);
    renderSection();

    expect(await screen.findByText('settings.focusBear.pastedTokenConnected')).toBeInTheDocument();
    expect(screen.getByText('settings.focusBear.pastedTokenHint')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'settings.focusBear.connect' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'settings.focusBear.disconnect' })).toBeInTheDocument();
  });

  it('disables Connect when this server has no Focus Bear sign-in configured', async () => {
    mockConnection({ ...NOT_CONNECTED, oauthAvailable: false });
    renderSection();

    expect(await screen.findByText('settings.focusBear.unavailable')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'settings.focusBear.connect' })).toBeDisabled();
  });

  it('reports a successful return from Focus Bear once and clears it from the URL', async () => {
    window.location.search = '?focusBear=connected';
    mockConnection(SIGNED_IN);
    renderSection();

    expect(await screen.findByText('settings.focusBear.result.connected')).toBeInTheDocument();
    expect(captureEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.FOCUS_BEAR_CONNECTED);
    expect(window.history.replaceState).toHaveBeenCalledWith({}, '', '/settings#focus-bear');
  });

  it('explains a failed return from Focus Bear as an alert', async () => {
    window.location.search = '?focusBear=expired';
    mockConnection(NOT_CONNECTED);
    renderSection();

    expect(await screen.findByRole('alert')).toHaveTextContent('settings.focusBear.result.expired');
    expect(captureEvent).not.toHaveBeenCalled();
  });

  it('ignores an unknown result value', async () => {
    window.location.search = '?focusBear=toString';
    mockConnection(NOT_CONNECTED);
    renderSection();

    await screen.findByText('settings.focusBear.notConnected');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
