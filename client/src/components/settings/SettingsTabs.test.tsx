import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { findSettingsTabOf, SETTINGS_TAB, type SettingsTabId } from './settings-tabs';
import { SettingsTabBar, SettingsTabPanel } from './SettingsTabs';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const TabbedPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<SettingsTabId>(SETTINGS_TAB.EMAIL);
  return (
    <>
      <SettingsTabBar activeTab={activeTab} onSelect={setActiveTab} />
      <SettingsTabPanel tabId={SETTINGS_TAB.EMAIL} activeTab={activeTab}>
        <section id="email-accounts">Email accounts</section>
      </SettingsTabPanel>
      <SettingsTabPanel tabId={SETTINGS_TAB.AI} activeTab={activeTab}>
        <section id="context">About me</section>
      </SettingsTabPanel>
      <SettingsTabPanel tabId={SETTINGS_TAB.ACCOUNT} activeTab={activeTab}>
        <section id="set-password">Password</section>
      </SettingsTabPanel>
    </>
  );
};

describe('Settings tabs (#442)', () => {
  it('opens on the Email tab, with the other tabs hidden but still on the page', () => {
    render(<TabbedPage />);

    expect(screen.getByRole('tab', { name: 'settings.nav.emailDelivery' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Email accounts')).toBeVisible();
    expect(screen.getByText('Password')).not.toBeVisible();
  });

  it('shows a tab when it is clicked', () => {
    render(<TabbedPage />);

    fireEvent.click(screen.getByRole('tab', { name: 'settings.tabs.account' }));

    expect(screen.getByText('Password')).toBeVisible();
    expect(screen.getByText('Email accounts')).not.toBeVisible();
  });

  it('moves between tabs with the arrow, Home and End keys', () => {
    render(<TabbedPage />);
    const emailTab = screen.getByRole('tab', { name: 'settings.nav.emailDelivery' });

    fireEvent.keyDown(emailTab, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'settings.nav.guideOurAI' })).toHaveFocus();
    expect(screen.getByText('About me')).toBeVisible();

    fireEvent.keyDown(document.activeElement as Element, { key: 'End' });
    expect(screen.getByRole('tab', { name: 'settings.tabs.account' })).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowRight' });
    expect(emailTab).toHaveAttribute('aria-selected', 'true');
  });

  it('keeps only the active tab in the Tab order', () => {
    render(<TabbedPage />);

    expect(screen.getByRole('tab', { name: 'settings.nav.emailDelivery' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: 'settings.nav.guideOurAI' })).toHaveAttribute('tabindex', '-1');
  });

  it('finds which tab holds a section, even while that tab is hidden', () => {
    render(<TabbedPage />);

    expect(findSettingsTabOf(document.getElementById('set-password'))).toBe(SETTINGS_TAB.ACCOUNT);
    expect(findSettingsTabOf(document.getElementById('context'))).toBe(SETTINGS_TAB.AI);
    expect(findSettingsTabOf(document.body)).toBeNull();
    expect(findSettingsTabOf(null)).toBeNull();
  });
});
