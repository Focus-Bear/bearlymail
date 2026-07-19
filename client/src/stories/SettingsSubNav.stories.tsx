/**
 * Storybook stories for the settings sidebar sub-navigation (SettingsSubNav).
 *
 * PR #2591 restructured the flat settings nav into 7 collapsible groups:
 * Account & Security, Email Delivery, Guide Our AI, Scheduling,
 * Integrations & Apps, Team & Plan, and Data & Account.
 *
 * These stories render the REAL SettingsSubNav component from Sidebar.tsx with
 * all groups expanded (the default state), using the app's full English locale.
 */
import React from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import type { Meta, StoryObj } from '@storybook/react';
import i18n from 'i18next';

import { SettingsSubNav } from 'components/inbox/Sidebar';
import en from 'locales/en.json';

const settingsNavI18n = i18n.createInstance();
settingsNavI18n.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  resources: { en: { translation: en } },
  interpolation: { escapeValue: false },
});

const SidebarWidthWrapper: React.FC<{ isAdmin: boolean }> = ({ isAdmin }) => (
  <I18nextProvider i18n={settingsNavI18n}>
    <MemoryRouter initialEntries={['/settings']}>
      <div
        data-testid="settings-subnav-container"
        style={{
          width: '240px',
          background: '#FFFFFF',
          border: '1px solid #E5E7EB',
          borderRadius: '8px',
          padding: '12px 8px',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        }}
      >
        <SettingsSubNav isAdmin={isAdmin} />
      </div>
    </MemoryRouter>
  </I18nextProvider>
);

const meta: Meta = {
  title: 'Inbox/Sidebar/SettingsSubNav',
  parameters: {
    layout: 'centered',
    backgrounds: { default: 'light gray' },
  },
};

export default meta;
type Story = StoryObj;

/** All 7 groups expanded, admin-only items (e.g. MFA) visible. */
export const AdminView: Story = {
  name: 'All groups expanded (admin)',
  render: () => <SidebarWidthWrapper isAdmin />,
};

/** All 7 groups expanded without admin-only items. */
export const NonAdminView: Story = {
  name: 'All groups expanded (non-admin)',
  render: () => <SidebarWidthWrapper isAdmin={false} />,
};
