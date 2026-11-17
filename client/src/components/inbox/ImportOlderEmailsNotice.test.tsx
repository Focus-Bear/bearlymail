import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';

import { API_ENDPOINT_IMPORT_OLDER_EMAILS, IMPORT_OLDER_STATUS, SETTINGS_PLANS_ROUTE } from 'constants/strings';

import { getRemainingPlanCredits, IMPORT_OLDER_NOTICE_TEST_ID, ImportOlderEmailsNotice } from './ImportOlderEmailsNotice';

vi.mock('axios');

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) => (options?.count === undefined ? key : `${key}:${options.count}`),
  }),
}));

const USAGE = {
  emailsUsed: 700,
  emailLimit: 1000,
  percentUsed: 70,
  tier: 'free',
  planStatus: 'active',
  trialEndsAt: null,
};
let mockUsage: typeof USAGE | (typeof USAGE & { selfHosted: boolean }) | undefined = USAGE;
vi.mock('queries/useOrgUsage', () => ({
  useVolumeUsage: () => ({ data: mockUsage }),
}));

const renderNotice = (props: Partial<React.ComponentProps<typeof ImportOlderEmailsNotice>> = {}) =>
  render(
    <MemoryRouter>
      <ImportOlderEmailsNotice syncWindowLimited isTriageCleared {...props} />
    </MemoryRouter>
  );

describe('ImportOlderEmailsNotice', () => {
  beforeEach(() => {
    mockUsage = USAGE;
    vi.mocked(axios.post).mockReset();
  });

  it('stays hidden while Triage still has mail', () => {
    renderNotice({ isTriageCleared: false });
    expect(screen.queryByTestId(IMPORT_OLDER_NOTICE_TEST_ID)).toBeNull();
  });

  it('stays hidden when the first sync imported everything', () => {
    renderNotice({ syncWindowLimited: false });
    expect(screen.queryByTestId(IMPORT_OLDER_NOTICE_TEST_ID)).toBeNull();
  });

  it('offers the next 500 and the remaining plan credits once Triage is cleared', () => {
    renderNotice();
    const notice = screen.getByTestId(IMPORT_OLDER_NOTICE_TEST_ID);
    expect(notice.textContent).toContain('inbox.importOlderNotice.message:500');
    expect(notice.textContent).toContain('inbox.importOlderNotice.processMore:500');
    expect(notice.textContent).toContain('inbox.importOlderNotice.credits:300');
    expect(screen.getByRole('link', { name: 'inbox.importOlderNotice.viewPlans' }).getAttribute('href')).toBe(
      SETTINGS_PLANS_ROUTE
    );
  });

  it('starts the next import batch when clicked', async () => {
    vi.mocked(axios.post).mockResolvedValue({ data: { status: IMPORT_OLDER_STATUS.QUEUED, queuedThreads: 480 } });
    renderNotice();

    fireEvent.click(screen.getByRole('button', { name: 'inbox.importOlderNotice.processMore:500' }));

    await waitFor(() =>
      expect(screen.getByTestId(IMPORT_OLDER_NOTICE_TEST_ID).textContent).toContain(
        'inbox.importOlderNotice.queued:480'
      )
    );
    expect(vi.mocked(axios.post).mock.calls[0][0]).toContain(API_ENDPOINT_IMPORT_OLDER_EMAILS);
  });

  it('omits the credits sentence on self-hosted deployments', () => {
    mockUsage = { ...USAGE, selfHosted: true };
    renderNotice();
    expect(screen.getByTestId(IMPORT_OLDER_NOTICE_TEST_ID).textContent).not.toContain('credits');
  });
});

describe('getRemainingPlanCredits', () => {
  it('never goes below zero', () => {
    expect(getRemainingPlanCredits({ ...USAGE, emailsUsed: 1200 } as never)).toBe(0);
  });
});
