import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';
import { VolumeUsage } from 'queries/useOrgUsage';

import { getRevenueCatApiKey } from 'config/revenuecat';

import { PlanPickerModal } from './PlanPickerModal';

vi.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const showSuccess = vi.fn();
const showError = vi.fn();
vi.mock('contexts/NotificationContext', () => ({
  useNotifications: () => ({ showSuccess, showError }),
}));

vi.mock('contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1', email: 'owner@example.com' } }),
}));

vi.mock('config/revenuecat', () => ({
  getRevenueCatApiKey: vi.fn(),
}));
const mockedGetKey = vi.mocked(getRevenueCatApiKey);

const rcMocks = vi.hoisted(() => {
  const instance = {
    getOfferings: vi.fn(),
    purchase: vi.fn(),
    getAppUserId: vi.fn(() => 'user-1'),
    changeUser: vi.fn(),
  };
  return {
    instance,
    isConfigured: vi.fn(() => false),
    configure: vi.fn(() => instance),
    getSharedInstance: vi.fn(() => instance),
  };
});

vi.mock('@revenuecat/purchases-js', () => {
  class MockPurchasesError extends Error {
    errorCode: number;
    constructor(errorCode: number) {
      super('purchases error');
      this.errorCode = errorCode;
    }
  }
  return {
    ErrorCode: { UserCancelledError: 1 },
    PurchasesError: MockPurchasesError,
    Purchases: {
      isConfigured: rcMocks.isConfigured,
      configure: rcMocks.configure,
      getSharedInstance: rcMocks.getSharedInstance,
    },
  };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
  }),
}));

const TIERS = [
  { id: 'bearlymail_starter', monthlyPriceUsd: 10, emailsPerCycle: 3000 },
  { id: 'bearlymail_growth', monthlyPriceUsd: 20, emailsPerCycle: 10000 },
  { id: 'bearlymail_enterprise', monthlyPriceUsd: 50, emailsPerCycle: 30000 },
];

const OFFERINGS = {
  all: {
    default: {
      availablePackages: [
        { identifier: '$rc_monthly', webBillingProduct: { identifier: 'bearlymail_starter' } },
        { identifier: 'growth_pkg', webBillingProduct: { identifier: 'bearlymail_growth' } },
        { identifier: 'enterprise_pkg', webBillingProduct: { identifier: 'bearlymail_enterprise' } },
      ],
    },
  },
};

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

describe('PlanPickerModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetKey.mockReturnValue('rcb_test_key');
    rcMocks.isConfigured.mockReturnValue(false);
    rcMocks.configure.mockReturnValue(rcMocks.instance);
    rcMocks.instance.getOfferings.mockResolvedValue(OFFERINGS);
    rcMocks.instance.purchase.mockResolvedValue({});
    mockedAxios.post.mockResolvedValue({ data: { success: true } });
    mockedAxios.get.mockImplementation((url: string) => {
      if (url.includes('/subscriptions/tiers')) {
        return Promise.resolve({ data: TIERS });
      }
      if (url.includes('/organizations/usage')) {
        return Promise.resolve({ data: buildVolumeUsage({ planStatus: 'active', tier: 'bearlymail_growth' }) });
      }
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
  });

  it('renders all three tiers with buy buttons for an owner/admin', async () => {
    renderModal();

    expect(await screen.findByTestId('plan-tier-card-bearlymail_starter')).toBeInTheDocument();
    expect(screen.getByTestId('plan-tier-card-bearlymail_growth')).toBeInTheDocument();
    expect(screen.getByTestId('plan-tier-card-bearlymail_enterprise')).toBeInTheDocument();
    expect(screen.getAllByText('team.settings.planPicker.choosePlan')).toHaveLength(3);
  });

  it('highlights the current plan and disables its button', async () => {
    renderModal({
      volumeUsage: buildVolumeUsage({ planStatus: 'active', tier: 'bearlymail_growth' }),
    });

    await screen.findByTestId('plan-tier-card-bearlymail_growth');
    // Badge + disabled button both carry the currentPlan label.
    expect(screen.getAllByText('team.settings.planPicker.currentPlan').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByTestId('plan-choose-bearlymail_growth')).not.toBeInTheDocument();
    expect(screen.getByTestId('plan-choose-bearlymail_starter')).toBeInTheDocument();
  });

  it('shows a read-only view with a hint for non-admin members', async () => {
    renderModal({ canPurchase: false, showMemberNote: true });

    await screen.findByTestId('plan-tier-card-bearlymail_starter');
    expect(screen.getByText('team.settings.planPicker.memberNote')).toBeInTheDocument();
    expect(screen.queryByText('team.settings.planPicker.choosePlan')).not.toBeInTheDocument();
    expect(screen.queryByText('team.settings.planPicker.contactUs')).not.toBeInTheDocument();
  });

  it('falls back to the contact-us CTA when no RevenueCat key is configured', async () => {
    mockedGetKey.mockReturnValue(null);
    renderModal();

    await screen.findByTestId('plan-tier-card-bearlymail_starter');
    expect(screen.getAllByText('team.settings.planPicker.contactUs')).toHaveLength(3);
    expect(screen.getByText('team.settings.planPicker.contactNote')).toBeInTheDocument();
    expect(screen.queryByText('team.settings.planPicker.choosePlan')).not.toBeInTheDocument();
  });

  it('links the user, purchases the matching package, and reports success once the plan activates', async () => {
    renderModal();

    await userEvent.click(await screen.findByTestId('plan-choose-bearlymail_growth'));

    await waitFor(() =>
      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringMatching(/\/subscriptions\/link-revenuecat$/),
        { revenueCatUserId: 'user-1' },
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      ),
    );
    await waitFor(() => expect(rcMocks.instance.purchase).toHaveBeenCalled());
    expect(rcMocks.configure).toHaveBeenCalledWith({ apiKey: 'rcb_test_key', appUserId: 'user-1' });
    const purchaseArgs = rcMocks.instance.purchase.mock.calls[0][0];
    expect(purchaseArgs.rcPackage.webBillingProduct.identifier).toBe('bearlymail_growth');
    expect(purchaseArgs.customerEmail).toBe('owner@example.com');

    // The usage poll returns planStatus 'active' immediately → success state.
    expect(await screen.findByTestId('plan-purchase-status-success')).toBeInTheDocument();
    expect(showSuccess).toHaveBeenCalled();
    expect(showError).not.toHaveBeenCalled();
  });

  it('stays silent when the user cancels the RevenueCat checkout', async () => {
    const { PurchasesError, ErrorCode } = await import('@revenuecat/purchases-js');
    rcMocks.instance.purchase.mockRejectedValue(
      new (PurchasesError as unknown as new (code: number) => Error)(ErrorCode.UserCancelledError as unknown as number),
    );
    renderModal();

    await userEvent.click(await screen.findByTestId('plan-choose-bearlymail_starter'));

    await waitFor(() => expect(rcMocks.instance.purchase).toHaveBeenCalled());
    // Back to the picker, no error toast.
    expect(await screen.findByTestId('plan-choose-bearlymail_starter')).toBeEnabled();
    expect(showError).not.toHaveBeenCalled();
    expect(screen.queryByTestId('plan-purchase-status-success')).not.toBeInTheDocument();
  });

  it('shows an error toast when the purchase fails', async () => {
    rcMocks.instance.purchase.mockRejectedValue(new Error('card declined'));
    renderModal();

    await userEvent.click(await screen.findByTestId('plan-choose-bearlymail_enterprise'));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('team.settings.planPicker.purchaseError'));
    expect(screen.queryByTestId('plan-purchase-status-success')).not.toBeInTheDocument();
  });
});
