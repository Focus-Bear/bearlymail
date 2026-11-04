import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';

import { ROUTE_CRM_CONTACTS, ROUTE_CRM_DEALS } from 'constants/strings';
import { useCrmPlanAccess } from 'hooks/useCrmPlanAccess';

import { Sidebar } from './Sidebar';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('utils/posthog', () => ({ captureEvent: vi.fn() }));
vi.mock('hooks/useCrmPlanAccess', () => ({ useCrmPlanAccess: vi.fn() }));
vi.mock('hooks/useResponsiveBreakpoints', () => ({
  useResponsiveBreakpoints: () => ({ isMobile: false, isTablet: false }),
}));

const renderSidebarOn = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Sidebar user={null} logout={vi.fn()} />
    </MemoryRouter>
  );

const givenCrmIncluded = (isCrmIncluded: boolean) =>
  vi.mocked(useCrmPlanAccess).mockReturnValue({ isCrmIncluded, isPlanLoading: false });

describe('Sidebar CRM entry', () => {
  it('shows a lock and the upgrade tooltip on a plan without the CRM', () => {
    givenCrmIncluded(false);
    renderSidebarOn(ROUTE_CRM_CONTACTS);
    expect(screen.getByTestId('sidebar-item-lock')).toBeInTheDocument();
    expect(screen.getByTitle('crm.locked')).toHaveAttribute('href', ROUTE_CRM_CONTACTS);
    expect(screen.queryByRole('link', { name: /crm\.deals/ })).not.toBeInTheDocument();
  });

  it('shows the CRM sub-navigation without a lock when the plan includes it', () => {
    givenCrmIncluded(true);
    renderSidebarOn(ROUTE_CRM_CONTACTS);
    expect(screen.queryByTestId('sidebar-item-lock')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /crm\.deals/ })).toHaveAttribute('href', ROUTE_CRM_DEALS);
  });
});
