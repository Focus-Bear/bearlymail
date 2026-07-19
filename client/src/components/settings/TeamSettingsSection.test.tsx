/**
 * TeamSettingsSection ?plans=open deep link (from the AI-limit banner's
 * "View plans" CTA): auto-opens the plan picker modal, then strips the query
 * param via a replace navigation while keeping the #team-usage hash.
 */
import React from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';

import { TeamSettingsSection } from './TeamSettingsSection';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('contexts/NotificationContext', () => ({
  useNotifications: () => ({ showError: vi.fn() }),
}));

vi.mock('contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1', email: 'owner@example.com' } }),
}));

const mutationMock = () => ({ mutateAsync: vi.fn(), isPending: false });

vi.mock('queries/useMyOrganization', () => ({
  useMyOrganization: () => ({
    data: {
      id: 'org-1',
      name: 'Acme Corp',
      ownerId: 'user-1',
      members: [
        {
          id: 'member-1',
          userId: 'user-1',
          email: 'owner@example.com',
          displayName: 'Owner',
          role: 'owner',
          status: 'active',
        },
      ],
    },
    isLoading: false,
  }),
  useInviteMember: () => mutationMock(),
  useUpdateMemberRole: () => mutationMock(),
  useRemoveMember: () => mutationMock(),
}));

vi.mock('queries/useOrgUsage', () => ({
  useSeatUsage: () => ({ data: undefined }),
  useVolumeUsage: () => ({
    data: {
      emailsUsed: 3000,
      emailLimit: 3000,
      percentUsed: 100,
      tier: 'bearlymail_starter',
      planStatus: 'active',
      trialEndsAt: null,
      selfHosted: false,
    },
  }),
  useApplyPromoCode: () => mutationMock(),
}));

vi.mock('components/settings/PlanStatusBanner', () => ({
  PlanStatusBanner: () => null,
}));

vi.mock('components/ConfirmModal', () => ({
  ConfirmModal: () => null,
}));

vi.mock('components/settings/plan-picker/PlanPickerModal', () => ({
  PlanPickerModal: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="plan-picker-open" /> : <div data-testid="plan-picker-closed" />,
}));

const LocationProbe: React.FC = () => {
  const location = useLocation();
  return (
    <div data-testid="location-probe" data-search={location.search} data-hash={location.hash} />
  );
};

const renderAt = (initialEntry: string) =>
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route
          path="/settings"
          element={
            <>
              <TeamSettingsSection />
              <LocationProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );

describe('TeamSettingsSection plans deep link', () => {
  it('opens the plan picker and strips the param (keeping the hash) for ?plans=open', async () => {
    renderAt('/settings?plans=open#team-usage');

    expect(await screen.findByTestId('plan-picker-open')).toBeInTheDocument();

    await waitFor(() => {
      const probe = screen.getByTestId('location-probe');
      expect(probe.getAttribute('data-search')).toBe('');
      expect(probe.getAttribute('data-hash')).toBe('#team-usage');
    });
  });

  it('preserves other query params when stripping plans=open', async () => {
    renderAt('/settings?tab=team&plans=open#team-usage');

    expect(await screen.findByTestId('plan-picker-open')).toBeInTheDocument();

    await waitFor(() => {
      const probe = screen.getByTestId('location-probe');
      expect(probe.getAttribute('data-search')).toBe('?tab=team');
      expect(probe.getAttribute('data-hash')).toBe('#team-usage');
    });
  });

  it('keeps the plan picker closed without the param', () => {
    renderAt('/settings#team-usage');

    expect(screen.getByTestId('plan-picker-closed')).toBeInTheDocument();
    expect(screen.queryByTestId('plan-picker-open')).not.toBeInTheDocument();
  });
});
