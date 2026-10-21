import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen } from '@testing-library/react';

import { OPEN_TRACKING_SETTINGS_ANCHOR } from 'constants/openTracking';

import { OPEN_TRACKING_NOTICE_DISMISSED_KEY_PREFIX, OpenTrackingNoticeBanner } from './OpenTrackingNoticeBanner';

let mockIsEmailTrackingIncluded = true;
vi.mock('hooks/useIsEmailTrackingIncluded', () => ({
  useIsEmailTrackingIncluded: () => mockIsEmailTrackingIncluded,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const BANNER_TEST_ID = 'open-tracking-notice-banner';
const MANAGE_LABEL = 'inbox.openTrackingNotice.manage';
const DISMISS_LABEL = 'inbox.openTrackingNotice.dismiss';

const userId = 'user-1';
const storageKey = `${OPEN_TRACKING_NOTICE_DISMISSED_KEY_PREFIX}${userId}`;

const renderBanner = (props: Partial<React.ComponentProps<typeof OpenTrackingNoticeBanner>> = {}) =>
  render(
    <MemoryRouter>
      <OpenTrackingNoticeBanner userId={userId} trackEmailOpens hasSeenTour {...props} />
    </MemoryRouter>
  );

describe('OpenTrackingNoticeBanner', () => {
  beforeEach(() => {
    localStorage.clear();
    mockIsEmailTrackingIncluded = true;
  });

  it('tells a user with tracking on, once the tour is done', () => {
    renderBanner();

    expect(screen.getByTestId(BANNER_TEST_ID)).toBeInTheDocument();
    expect(screen.getByText(/inbox\.openTrackingNotice\.message/)).toBeInTheDocument();
  });

  it('links to the open-tracking setting', () => {
    renderBanner();

    expect(screen.getByRole('link', { name: MANAGE_LABEL })).toHaveAttribute(
      'href',
      `/settings#${OPEN_TRACKING_SETTINGS_ANCHOR}`
    );
  });

  it('stays hidden when the plan does not include tracking', () => {
    mockIsEmailTrackingIncluded = false;
    renderBanner();

    expect(screen.queryByTestId(BANNER_TEST_ID)).not.toBeInTheDocument();
  });

  it('stays hidden when the user has turned tracking off', () => {
    renderBanner({ trackEmailOpens: false });

    expect(screen.queryByTestId(BANNER_TEST_ID)).not.toBeInTheDocument();
  });

  it('waits until the tour is done so it never stacks on a new user’s first inbox', () => {
    renderBanner({ hasSeenTour: false });

    expect(screen.queryByTestId(BANNER_TEST_ID)).not.toBeInTheDocument();
  });

  it('dismisses for good when the close button is clicked', () => {
    renderBanner();

    fireEvent.click(screen.getByRole('button', { name: DISMISS_LABEL }));

    expect(screen.queryByTestId(BANNER_TEST_ID)).not.toBeInTheDocument();
    expect(localStorage.getItem(storageKey)).toBe('true');
  });

  it('counts following the settings link as seen', () => {
    renderBanner();

    fireEvent.click(screen.getByRole('link', { name: MANAGE_LABEL }));

    expect(localStorage.getItem(storageKey)).toBe('true');
  });

  it('does not show again once dismissed', () => {
    localStorage.setItem(storageKey, 'true');

    renderBanner();

    expect(screen.queryByTestId(BANNER_TEST_ID)).not.toBeInTheDocument();
  });

  it('tracks dismissal per user, so another account on the same browser still sees it', () => {
    localStorage.setItem(storageKey, 'true');

    renderBanner({ userId: 'user-2' });

    expect(screen.getByTestId(BANNER_TEST_ID)).toBeInTheDocument();
  });
});
