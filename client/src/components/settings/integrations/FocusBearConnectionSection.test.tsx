import React from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { captureEvent } from 'utils/posthog';

import { ANALYTICS_EVENTS } from 'constants/analytics-events';

import { FocusBearConnectionSection } from './FocusBearConnectionSection';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('utils/posthog', () => ({ captureEvent: vi.fn() }));

const connection = { connected: false };
const startConnect = { mutate: vi.fn(), isPending: false, isError: false };
const disconnect = { mutate: vi.fn() };
vi.mock('queries/useFocusBear', () => ({
  useFocusBearConnectionQuery: () => ({ data: connection }),
  useStartFocusBearConnect: () => startConnect,
  useDisconnectFocusBear: () => disconnect,
}));

const LocationProbe: React.FC = () => <span data-testid="search">{useLocation().search}</span>;

const renderSection = (url = '/settings') =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[url]}>
        <FocusBearConnectionSection />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>
  );

describe('FocusBearConnectionSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    connection.connected = false;
    startConnect.isPending = false;
    startConnect.isError = false;
  });

  it('starts the Focus Bear sign-in, and asks for no token', async () => {
    renderSection();

    await userEvent.click(screen.getByRole('button', { name: 'settings.focusBear.connect' }));

    expect(startConnect.mutate).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('settings.focusBear.notConnected');
  });

  it('offers only disconnect once connected', async () => {
    connection.connected = true;
    renderSection();

    await userEvent.click(screen.getByRole('button', { name: 'settings.focusBear.disconnect' }));

    expect(disconnect.mutate).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'settings.focusBear.connect' })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('settings.focusBear.connected');
  });

  it('records the connection when the sign-in comes back successful, and clears the outcome from the URL', async () => {
    renderSection('/settings?focusBear=connected&tab=integrations');

    await waitFor(() => expect(captureEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.FOCUS_BEAR_CONNECTED));
    expect(screen.getByTestId('search')).toHaveTextContent('?tab=integrations');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('says so when the sign-in comes back failed, until the user tries again', async () => {
    renderSection('/settings?focusBear=failed');

    expect(await screen.findByRole('alert')).toHaveTextContent('settings.focusBear.connectFailed');
    expect(captureEvent).not.toHaveBeenCalled();
    expect(screen.getByTestId('search')).toBeEmptyDOMElement();

    await userEvent.click(screen.getByRole('button', { name: 'settings.focusBear.connect' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('says so when the sign-in could not be started', () => {
    startConnect.isError = true;
    renderSection();

    expect(screen.getByRole('alert')).toHaveTextContent('settings.focusBear.connectUnavailable');
  });
});
