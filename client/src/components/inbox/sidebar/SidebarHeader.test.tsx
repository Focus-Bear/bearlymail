import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { captureEvent } from 'utils/posthog';

import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import { ROUTE_INBOX, ROUTE_SETTINGS } from 'constants/strings';

import { SidebarHeader } from './SidebarHeader';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('utils/posthog', () => ({ captureEvent: vi.fn() }));

const INBOX_PAGE_TEXT = 'inbox page';

const renderOnSettingsPage = (props: React.ComponentProps<typeof SidebarHeader> = {}) =>
  render(
    <MemoryRouter initialEntries={[ROUTE_SETTINGS]}>
      <SidebarHeader {...props} />
      <Routes>
        <Route path={ROUTE_INBOX} element={<p>{INBOX_PAGE_TEXT}</p>} />
        <Route path="*" element={null} />
      </Routes>
    </MemoryRouter>
  );

describe('SidebarHeader logo', () => {
  beforeEach(() => {
    vi.mocked(captureEvent).mockClear();
  });

  it('links to the inbox', () => {
    renderOnSettingsPage();
    expect(screen.getByRole('link', { name: 'sidebar.goToInbox' })).toHaveAttribute('href', ROUTE_INBOX);
  });

  it('navigates to the inbox and records the click', () => {
    renderOnSettingsPage();
    fireEvent.click(screen.getByRole('link', { name: 'sidebar.goToInbox' }));
    expect(screen.getByText(INBOX_PAGE_TEXT)).toBeInTheDocument();
    expect(captureEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.SIDEBAR_LOGO_CLICKED);
  });

  it('notifies the parent so the mobile menu can close', () => {
    const onLogoClick = vi.fn();
    renderOnSettingsPage({ onLogoClick });
    fireEvent.click(screen.getByRole('link', { name: 'sidebar.goToInbox' }));
    expect(onLogoClick).toHaveBeenCalledTimes(1);
  });

  it('stays a link to the inbox when the sidebar is collapsed', () => {
    renderOnSettingsPage({ isCollapsed: true });
    expect(screen.getByRole('link', { name: 'sidebar.goToInbox' })).toHaveAttribute('href', ROUTE_INBOX);
  });
});
