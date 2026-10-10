/**
 * PlanPickerModalDemo — wraps PlanPickerModal with all required providers for Storybook.
 *
 * PlanPickerModal uses:
 *  - usePlanTiers (React Query — seeded via QueryClient cache)
 *  - usePlanPurchase → useNotifications (NotificationProvider)
 *  - useTranslation (needs I18nextProvider)
 */
import React from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from 'i18next';
import { VolumeUsage } from 'queries/useOrgUsage';

import { PlanPickerModal } from 'components/settings/plan-picker/PlanPickerModal';
import { AuthContext } from 'contexts/AuthContext';
import { NotificationProvider } from 'contexts/NotificationContext';

const pickerI18n = i18n.createInstance();
pickerI18n.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  resources: {
    en: {
      translation: {
        'common.close': 'Close',
        'common.loading': 'Loading...',
        'team.settings.tierStarter': 'Starter',
        'team.settings.tierGrowth': 'Growth',
        'team.settings.tierEnterprise': 'Enterprise',
        'team.settings.planPicker.title': 'Choose your plan',
        'team.settings.planPicker.pricePerMonth': '${{price}}/month',
        'team.settings.planPicker.emailsPerCycle_one': '{{count}} AI-processed email per month',
        'team.settings.planPicker.emailsPerCycle_other': '{{count}} AI-processed emails per month',
        'team.settings.planPicker.choosePlan': 'Choose plan',
        'team.settings.planPicker.currentPlan': 'Current plan',
        'team.settings.planPicker.openingCheckout': 'Opening checkout…',
        'team.settings.planPicker.memberNote': 'Ask your organisation owner or an admin to upgrade the plan.',
        'team.settings.planPicker.contactNote': "In-app checkout isn't available yet — contact us and we'll get you upgraded.",
        'team.settings.planPicker.contactUs': 'Contact us',
        'team.settings.planPicker.loadError': "Couldn't load the plans. Please try again later.",
      },
    },
  },
  interpolation: { escapeValue: false },
});

const demoAuth = {
  user: { id: 'user-1', email: 'owner@example.com', name: 'Alice' },
  loading: false,
  login: async () => {},
  loginWithAppleMail: async () => {},
  register: async () => {},
  logout: () => {},
  refreshUser: async () => {},
};

const DEMO_TIERS = [
  { id: 'bearlymail_starter', monthlyPriceUsd: 15, emailsPerCycle: 3000 },
  { id: 'bearlymail_growth', monthlyPriceUsd: 25, emailsPerCycle: 10000 },
  { id: 'bearlymail_enterprise', monthlyPriceUsd: 40, emailsPerCycle: 30000 },
];

export type PlanPickerScenario = 'default' | 'currentPlan' | 'member' | 'fallback';

function buildVolumeUsage(scenario: PlanPickerScenario): VolumeUsage {
  if (scenario === 'currentPlan') {
    return {
      emailsUsed: 4200,
      emailLimit: 10000,
      percentUsed: 42,
      tier: 'bearlymail_growth',
      planStatus: 'active',
      trialEndsAt: null,
    };
  }
  return {
    emailsUsed: 800,
    emailLimit: 3000,
    percentUsed: 27,
    tier: 'none',
    planStatus: 'trial',
    trialEndsAt: null,
  };
}

export const PlanPickerModalDemo: React.FC<{ scenario: PlanPickerScenario }> = ({ scenario }) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  queryClient.setQueryData(['subscriptions', 'tiers'], DEMO_TIERS);

  // Clicking "Choose plan" calls the checkout API, which fails fast in
  // Storybook (no backend) — that is expected; the stories showcase layout.
  return (
    <I18nextProvider i18n={pickerI18n}>
      <NotificationProvider>
        <AuthContext.Provider value={demoAuth}>
          <QueryClientProvider client={queryClient}>
            <PlanPickerModal
              isOpen
              onClose={() => {}}
              volumeUsage={buildVolumeUsage(scenario)}
              canPurchase={scenario === 'default' || scenario === 'currentPlan'}
              showMemberNote={scenario === 'member'}
            />
          </QueryClientProvider>
        </AuthContext.Provider>
      </NotificationProvider>
    </I18nextProvider>
  );
};
