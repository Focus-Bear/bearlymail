/**
 * AiLimitBanner stories — the persistent, dismissible app-level banner shown
 * when the API rejects an AI request with the org's volume-limit 402. Renders
 * the presentational view (the container needs live axios/router wiring).
 */
import React from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import type { Meta, StoryObj } from '@storybook/react';
import i18n from 'i18next';
import { theme } from 'theme/theme';

import { AiLimitBannerView } from 'components/notifications/AiLimitBanner';

const bannerI18n = i18n.createInstance();
bannerI18n.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  resources: {
    en: {
      translation: {
        'team.settings.aiLimitReached':
          "You've reached your plan's AI usage limit — AI features are paused until your plan renews or you upgrade.",
        'team.settings.planPicker.viewPlans': 'View plans',
        'common.dismiss': 'Dismiss',
      },
    },
  },
  interpolation: { escapeValue: false },
});

const AiLimitBannerDemo: React.FC = () => (
  <I18nextProvider i18n={bannerI18n}>
    <div
      style={{
        minHeight: 240,
        backgroundColor: theme.colors.background.default,
        fontFamily: theme.typography.fontFamily,
      }}
    >
      {/* The view is position:fixed at the top of the viewport, over the app. */}
      <AiLimitBannerView onViewPlans={() => {}} onDismiss={() => {}} />
      <div style={{ padding: '72px 24px 24px', color: theme.colors.text.secondary, fontSize: 14 }}>
        Inbox content stays visible underneath — the banner never auto-dismisses.
      </div>
    </div>
  </I18nextProvider>
);

const meta: Meta<typeof AiLimitBannerDemo> = {
  title: 'Notifications/AiLimitBanner',
  component: AiLimitBannerDemo,
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj<typeof AiLimitBannerDemo>;

export const LimitReached: Story = {
  name: 'AI limit reached',
};
