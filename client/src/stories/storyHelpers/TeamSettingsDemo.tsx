/**
 * TeamSettingsDemo — wraps TeamSettingsSection with mocked React Query providers
 * for use in Storybook. Supplies controlled data via QueryClient's cache seeding.
 */
import React from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from 'i18next';

import { TeamSettingsSection } from 'components/settings/TeamSettingsSection';

export interface TeamSettingsDemoProps {
  activeSeats?: number;
  maxSeats?: number;
  emailsUsed?: number;
  emailLimit?: number;
  tier?: string;
  hasOrg?: boolean;
}

const teamI18n = i18n.createInstance();
teamI18n.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  resources: {
    en: {
      translation: {
        'team.settings.title': 'Team',
        'team.settings.orgName': 'Organisation',
        'team.settings.noOrg': 'You are not part of a team organisation.',
        'team.settings.members': 'Members',
        'team.settings.noMembers': 'No active members yet.',
        'team.settings.pendingInvites': 'Pending Invites',
        'team.settings.pending': 'Pending',
        'team.settings.owner': 'Owner',
        'team.settings.remove': 'Remove',
        'team.settings.confirmRemove': 'Remove {{name}} from the organisation?',
        'team.settings.confirmRemoveTitle': 'Remove Member',
        'team.settings.inviteMember': 'Invite a Member',
        'team.settings.emailPlaceholder': 'Email address',
        'team.settings.sendInvite': 'Send Invite',
        'team.settings.inviting': 'Sending...',
        'team.settings.inviteSent': 'Invite sent successfully.',
        'team.settings.inviteError': 'Failed to send invite.',
        'team.settings.roleAdmin': 'Admin',
        'team.settings.roleMember': 'Member',
        'team.settings.roleChangeError': 'Failed to update role.',
        'team.settings.removeError': 'Failed to remove member.',
        'team.settings.seats': '{{active}} of {{max}} seats used',
        'team.settings.emailUsage': '{{used}} / {{limit}} emails used ({{percent}}%)',
        'team.settings.volumeWarning': 'Warning: {{percent}}% of your email volume used.',
        'team.settings.volumeLimitReached': 'Email volume limit reached.',
        'team.settings.promoCodeTitle': 'Promo Code',
        'team.settings.promoCodePlaceholder': 'Enter promo code',
        'team.settings.promoApply': 'Apply',
        'team.settings.promoApplying': 'Applying...',
        'team.settings.promoApplied': 'Promo code applied successfully.',
        'team.settings.promoError': 'Failed to apply promo code.',
        'common.loading': 'Loading...',
      },
    },
  },
  interpolation: { escapeValue: false },
});

function buildQueryClient(props: TeamSettingsDemoProps): QueryClient {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });

  if (props.hasOrg) {
    qc.setQueryData(['organization', 'me'], {
      id: 'org-1',
      name: 'Acme Corp',
      ownerId: 'user-1',
      members: [
        {
          id: 'member-1',
          userId: 'user-1',
          email: 'alice@acme.com',
          displayName: 'Alice',
          role: 'owner',
          status: 'active',
          invitedBy: 'user-1',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'member-2',
          userId: 'user-2',
          email: 'bob@acme.com',
          displayName: 'Bob',
          role: 'admin',
          status: 'active',
          invitedBy: 'user-1',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'member-3',
          userId: null,
          email: 'charlie@acme.com',
          displayName: null,
          role: 'member',
          status: 'pending',
          invitedBy: 'user-1',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    });

    qc.setQueryData(['organization', 'seats'], {
      activeSeats: props.activeSeats ?? 2,
      maxSeats: props.maxSeats ?? 5,
      canInvite: (props.activeSeats ?? 2) < (props.maxSeats ?? 5),
    });

    qc.setQueryData(['organization', 'usage'], {
      emailsUsed: props.emailsUsed ?? 1200,
      emailLimit: props.emailLimit ?? 3000,
      percentUsed: Math.round(((props.emailsUsed ?? 1200) / (props.emailLimit ?? 3000)) * 100),
      tier: props.tier ?? 'bearlymail_starter',
    });
  } else {
    qc.setQueryData(['organization', 'me'], null);
    qc.setQueryData(['organization', 'seats'], {
      activeSeats: 0,
      maxSeats: 0,
      canInvite: false,
    });
    qc.setQueryData(['organization', 'usage'], {
      emailsUsed: 0,
      emailLimit: 3000,
      percentUsed: 0,
      tier: 'none',
    });
  }

  return qc;
}

export const TeamSettingsDemo: React.FC<TeamSettingsDemoProps> = props => {
  const queryClient = React.useMemo(() => buildQueryClient(props), [props]);

  return (
    <I18nextProvider i18n={teamI18n}>
      <QueryClientProvider client={queryClient}>
        {/* TeamSettingsSection reads the ?plans=open deep link via the router. */}
        <MemoryRouter initialEntries={['/settings']}>
          <div style={{ maxWidth: 600, padding: 24 }}>
            <TeamSettingsSection />
          </div>
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>
  );
};
