import React from 'react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from 'i18n';
import { captureEvent } from 'utils/posthog';

import {
  AUTO_ARCHIVE_PROPOSAL_STATUS,
  AutoArchiveProposal,
  fetchAutoArchiveProposals,
} from 'components/settings/auto-archive/autoArchiveProposals.api';
import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import { AUTO_ARCHIVE_PROPOSALS_SETTINGS_ANCHOR } from 'constants/autoArchive';
import { ROUTE_SETTINGS } from 'constants/strings';

import { AUTO_ARCHIVE_NOTICE_TEST_ID } from './AutoArchiveSuggestionsBanner';
import { AutoArchiveSuggestionsNotice } from './AutoArchiveSuggestionsNotice';

vi.mock('components/settings/auto-archive/autoArchiveProposals.api', async importOriginal => ({
  ...(await importOriginal<typeof import('components/settings/auto-archive/autoArchiveProposals.api')>()),
  fetchAutoArchiveProposals: vi.fn(),
}));
vi.mock('utils/posthog', () => ({ captureEvent: vi.fn() }));

const mockedFetch = vi.mocked(fetchAutoArchiveProposals);
const USER_ID = 'user-1';
const INBOX_ROUTE = '/inbox';
const SETTINGS_PROBE_TEST_ID = 'settings-location';

const proposal = (id: string): AutoArchiveProposal =>
  ({ id, status: AUTO_ARCHIVE_PROPOSAL_STATUS.PENDING }) as AutoArchiveProposal;

const SettingsLocationProbe: React.FC = () => {
  const location = useLocation();
  return <div data-testid={SETTINGS_PROBE_TEST_ID}>{`${location.pathname}${location.hash}`}</div>;
};

const renderNotice = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={[INBOX_ROUTE]}>
          <Routes>
            <Route path={INBOX_ROUTE} element={<AutoArchiveSuggestionsNotice userId={USER_ID} hasSeenTour />} />
            <Route path={ROUTE_SETTINGS} element={<SettingsLocationProbe />} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>
  );

const waitForFetch = () => waitFor(() => expect(mockedFetch).toHaveBeenCalled());

describe('AutoArchiveSuggestionsNotice', () => {
  beforeEach(() => {
    localStorage.clear();
    void i18n.changeLanguage('en');
  });

  it('renders nothing when there are no pending suggestions', async () => {
    mockedFetch.mockResolvedValue([]);
    renderNotice();

    await waitForFetch();
    expect(screen.queryByTestId(AUTO_ARCHIVE_NOTICE_TEST_ID)).not.toBeInTheDocument();
  });

  it('ignores proposals that are no longer pending', async () => {
    mockedFetch.mockResolvedValue([{ ...proposal('p1'), status: AUTO_ARCHIVE_PROPOSAL_STATUS.DISMISSED }]);
    renderNotice();

    await waitForFetch();
    expect(screen.queryByTestId(AUTO_ARCHIVE_NOTICE_TEST_ID)).not.toBeInTheDocument();
  });

  it('uses the singular for one suggestion', async () => {
    mockedFetch.mockResolvedValue([proposal('p1')]);
    renderNotice();

    expect(await screen.findByText(/found 1 kind of email you never open/)).toBeInTheDocument();
  });

  it('shows the pluralised count and reports that it was shown', async () => {
    mockedFetch.mockResolvedValue([proposal('p1'), proposal('p2'), proposal('p3')]);
    renderNotice();

    expect(await screen.findByText(/found 3 kinds of email you never open/)).toBeInTheDocument();
    expect(captureEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.AUTO_ARCHIVE_INBOX_NOTICE_SHOWN, { count: 3 });
  });

  it('Review takes the user to the suggestions in Settings', async () => {
    mockedFetch.mockResolvedValue([proposal('p1')]);
    renderNotice();

    await userEvent.click(await screen.findByRole('link', { name: 'Review' }));

    expect(screen.getByTestId(SETTINGS_PROBE_TEST_ID)).toHaveTextContent(
      `${ROUTE_SETTINGS}#${AUTO_ARCHIVE_PROPOSALS_SETTINGS_ANCHOR}`
    );
    expect(captureEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.AUTO_ARCHIVE_INBOX_NOTICE_REVIEW_CLICKED, {
      count: 1,
    });
  });

  it('stays dismissed for the same suggestions and returns when a new one arrives', async () => {
    mockedFetch.mockResolvedValue([proposal('p1'), proposal('p2')]);
    const { unmount } = renderNotice();

    await userEvent.click(await screen.findByRole('button', { name: /dismiss/i }));
    expect(screen.queryByTestId(AUTO_ARCHIVE_NOTICE_TEST_ID)).not.toBeInTheDocument();
    expect(captureEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.AUTO_ARCHIVE_INBOX_NOTICE_DISMISSED, { count: 2 });
    unmount();

    mockedFetch.mockResolvedValue([proposal('p2'), proposal('p1')]);
    const sameSet = renderNotice();
    await waitForFetch();
    expect(screen.queryByTestId(AUTO_ARCHIVE_NOTICE_TEST_ID)).not.toBeInTheDocument();
    sameSet.unmount();

    mockedFetch.mockResolvedValue([proposal('p1'), proposal('p2'), proposal('p3')]);
    renderNotice();
    expect(await screen.findByTestId(AUTO_ARCHIVE_NOTICE_TEST_ID)).toBeInTheDocument();
  });

  it('renders nothing, silently, when the fetch fails', async () => {
    mockedFetch.mockRejectedValue(new Error('network down'));
    renderNotice();

    await waitForFetch();
    expect(screen.queryByTestId(AUTO_ARCHIVE_NOTICE_TEST_ID)).not.toBeInTheDocument();
  });
});
