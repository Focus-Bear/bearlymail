import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { PlanTier } from 'queries/usePlanTiers';
import { captureEvent } from 'utils/posthog';

import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import { SETTINGS_PLANS_ROUTE } from 'constants/strings';
import { useCrmPlanAccess } from 'hooks/useCrmPlanAccess';

import { CrmPlanGate } from './CrmPlanGate';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => (options ? `${key} ${JSON.stringify(options)}` : key),
  }),
}));
vi.mock('utils/posthog', () => ({ captureEvent: vi.fn() }));
vi.mock('hooks/useCrmPlanAccess', () => ({ useCrmPlanAccess: vi.fn() }));
vi.mock('components/layout/SidebarPageLayout', () => ({
  SidebarPageLayout: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));

const TIERS: PlanTier[] = [
  {
    id: 'bearlymail_starter',
    monthlyPriceUsd: 5,
    emailsPerCycle: 3000,
    seats: 1,
    includesEmailTracking: false,
    includesCrm: false,
  },
  {
    id: 'bearlymail_enterprise',
    monthlyPriceUsd: 40,
    emailsPerCycle: 30000,
    seats: 5,
    includesEmailTracking: true,
    includesCrm: true,
  },
  {
    id: 'bearlymail_growth',
    monthlyPriceUsd: 15,
    emailsPerCycle: 10000,
    seats: 1,
    includesEmailTracking: true,
    includesCrm: true,
  },
];
vi.mock('queries/usePlanTiers', () => ({ usePlanTiers: () => ({ data: TIERS }) }));

const CRM_PAGE_TEXT = 'crm page';

const renderGate = () =>
  render(
    <MemoryRouter>
      <CrmPlanGate>
        <p>{CRM_PAGE_TEXT}</p>
      </CrmPlanGate>
    </MemoryRouter>
  );

const givenAccess = (isCrmIncluded: boolean, isPlanLoading = false) =>
  vi.mocked(useCrmPlanAccess).mockReturnValue({ isCrmIncluded, isPlanLoading });

describe('CrmPlanGate', () => {
  it('renders the CRM page when the plan includes it', () => {
    givenAccess(true);
    renderGate();
    expect(screen.getByText(CRM_PAGE_TEXT)).toBeInTheDocument();
    expect(screen.queryByTestId('crm-upgrade-prompt')).not.toBeInTheDocument();
  });

  it('shows neither the page nor the prompt while the plan loads', () => {
    givenAccess(true, true);
    renderGate();
    expect(screen.queryByText(CRM_PAGE_TEXT)).not.toBeInTheDocument();
    expect(screen.queryByTestId('crm-upgrade-prompt')).not.toBeInTheDocument();
  });

  it('replaces the page with the upgrade prompt on a plan without the CRM', () => {
    givenAccess(false);
    renderGate();
    expect(screen.queryByText(CRM_PAGE_TEXT)).not.toBeInTheDocument();
    expect(screen.getByTestId('crm-upgrade-prompt')).toBeInTheDocument();
    expect(captureEvent).toHaveBeenCalledWith(ANALYTICS_EVENTS.CRM_UPGRADE_PROMPT_VIEWED);
  });

  it('quotes the cheapest plan that includes the CRM and links to the plans', () => {
    givenAccess(false);
    renderGate();
    expect(screen.getByTestId('crm-upgrade-plan-note')).toHaveTextContent('"plan":"team.settings.tierGrowth"');
    expect(screen.getByTestId('crm-upgrade-plan-note')).toHaveTextContent('"price":15');
    expect(screen.getByRole('link', { name: 'crm.upgrade.viewPlans' })).toHaveAttribute('href', SETTINGS_PLANS_ROUTE);
  });
});
