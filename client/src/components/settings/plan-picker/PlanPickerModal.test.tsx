import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';
import { VolumeUsage } from 'queries/useOrgUsage';

import { PlanPickerModal } from './PlanPickerModal';

vi.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const showError = vi.fn();
const showSuccess = vi.fn();
vi.mock('contexts/NotificationContext', () => ({
  useNotifications: () => ({ showError, showSuccess }),
}));

vi.mock('utils/posthog', () => ({ captureEvent: vi.fn() }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
  }),
}));

const TIERS = [
  { id: 'bearlymail_starter', monthlyPriceUsd: 15, emailsPerCycle: 3000 },
  { id: 'bearlymail_growth', monthlyPriceUsd: 25, emailsPerCycle: 10000 },
  { id: 'bearlymail_enterprise', monthlyPriceUsd: 40, emailsPerCycle: 30000 },
];

const CHECKOUT_URL = 'https://checkout.stripe.com/c/pay/cs_test_123';

// jsdom's window.location.assign is non-configurable, so replace the whole
// location object with a mock we can assert the redirect against.
const assignMock = vi.fn();
Object.defineProperty(window, 'location', {
  configurable: true,
  value: { assign: assignMock, href: 'http://localhost/settings', search: '', pathname: '/settings', hash: '' },
});

function buildVolumeUsage(overrides: Partial<VolumeUsage> = {}): VolumeUsage {
  return {
    emailsUsed: 100,
    emailLimit: 3000,
    percentUsed: 3,
    tier: 'none',
    planStatus: 'trial',
    trialEndsAt: null,
    ...overrides,
  };
}

function renderModal(props: Partial<React.ComponentProps<typeof PlanPickerModal>> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <PlanPickerModal
        isOpen
        onClose={vi.fn()}
        volumeUsage={buildVolumeUsage()}
        canPurchase
        showMemberNote={false}
        {...props}
      />
    </QueryClientProvider>,
  );
}

describe('PlanPickerModal (Stripe Hosted Checkout)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedAxios.get.mockImplementation((url: string) => {
      if (url.includes('/subscriptions/tiers')) {
        return Promise.resolve({ data: TIERS });
      }
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    mockedAxios.post.mockResolvedValue({ data: { url: CHECKOUT_URL } });
  });

  it('renders all three tiers with buy buttons for an owner/admin', async () => {
    renderModal();

    expect(await screen.findByTestId('plan-tier-card-bearlymail_starter')).toBeInTheDocument();
    expect(screen.getByTestId('plan-tier-card-bearlymail_growth')).toBeInTheDocument();
    expect(screen.getByTestId('plan-tier-card-bearlymail_enterprise')).toBeInTheDocument();
    expect(screen.getAllByText('team.settings.planPicker.choosePlan')).toHaveLength(3);
  });

  it('creates a Stripe checkout session and redirects when a plan is chosen', async () => {
    renderModal();

    await userEvent.click(await screen.findByTestId('plan-choose-bearlymail_growth'));

    await waitFor(() =>
      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringMatching(/\/subscriptions\/checkout$/),
        { tierId: 'bearlymail_growth' },
      ),
    );
    await waitFor(() => expect(assignMock).toHaveBeenCalledWith(CHECKOUT_URL));
    expect(showError).not.toHaveBeenCalled();
  });

  it('shows an error toast and does not redirect when checkout creation fails', async () => {
    mockedAxios.post.mockRejectedValue(new Error('boom'));
    renderModal();

    await userEvent.click(await screen.findByTestId('plan-choose-bearlymail_enterprise'));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('team.settings.planPicker.purchaseError'));
    expect(assignMock).not.toHaveBeenCalled();
    // Button is re-enabled for a retry.
    expect(await screen.findByTestId('plan-choose-bearlymail_enterprise')).toBeEnabled();
  });

  it('highlights the current plan and disables its button', async () => {
    renderModal({
      volumeUsage: buildVolumeUsage({ planStatus: 'active', tier: 'bearlymail_growth' }),
    });

    await screen.findByTestId('plan-tier-card-bearlymail_growth');
    expect(screen.getAllByText('team.settings.planPicker.currentPlan').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByTestId('plan-choose-bearlymail_growth')).not.toBeInTheDocument();
    expect(screen.getByTestId('plan-choose-bearlymail_starter')).toBeInTheDocument();
  });

  it('shows a read-only view with a hint for non-admin members', async () => {
    renderModal({ canPurchase: false, showMemberNote: true });

    await screen.findByTestId('plan-tier-card-bearlymail_starter');
    expect(screen.getByText('team.settings.planPicker.memberNote')).toBeInTheDocument();
    expect(screen.queryByText('team.settings.planPicker.choosePlan')).not.toBeInTheDocument();
  });

  it('falls back to the contact-us CTA when the user has no org to bill', async () => {
    renderModal({ canPurchase: false, showMemberNote: false });

    await screen.findByTestId('plan-tier-card-bearlymail_starter');
    expect(screen.getAllByText('team.settings.planPicker.contactUs')).toHaveLength(3);
    expect(screen.getByText('team.settings.planPicker.contactNote')).toBeInTheDocument();
    expect(screen.queryByText('team.settings.planPicker.choosePlan')).not.toBeInTheDocument();
  });
});
