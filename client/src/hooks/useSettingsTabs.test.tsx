import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { act, render, screen } from '@testing-library/react';

import { SETTINGS_TAB } from 'components/settings/settings-tabs';
import { SettingsTabPanel } from 'components/settings/SettingsTabs';

import { useSettingsTabs } from './useSettingsTabs';

const Page: React.FC<{ isReady: boolean }> = ({ isReady }) => {
  const { activeTab } = useSettingsTabs(isReady);
  return (
    <>
      <output data-testid="active-tab">{activeTab}</output>
      <SettingsTabPanel tabId={SETTINGS_TAB.EMAIL} activeTab={activeTab}>
        <section id="email-batching">Batching</section>
      </SettingsTabPanel>
      <SettingsTabPanel tabId={SETTINGS_TAB.INTEGRATIONS} activeTab={activeTab}>
        <section id="connected-apps">Apps</section>
      </SettingsTabPanel>
    </>
  );
};

function renderAt(path: string, isReady = true) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Page isReady={isReady} />
    </MemoryRouter>
  );
}

describe('useSettingsTabs', () => {
  it('starts on the Email tab', () => {
    renderAt('/settings');

    expect(screen.getByTestId('active-tab')).toHaveTextContent(SETTINGS_TAB.EMAIL);
  });

  it('opens the tab holding the section a link points at', () => {
    renderAt('/settings#connected-apps');

    expect(screen.getByTestId('active-tab')).toHaveTextContent(SETTINGS_TAB.INTEGRATIONS);
    expect(screen.getByText('Apps')).toBeVisible();
  });

  it('waits for a section that renders late', () => {
    vi.useFakeTimers();
    try {
      const view = renderAt('/settings#late-section');
      expect(screen.getByTestId('active-tab')).toHaveTextContent(SETTINGS_TAB.EMAIL);

      // The section appears once its own data has loaded.
      const late = document.createElement('div');
      late.id = 'late-section';
      document.getElementById('connected-apps')?.appendChild(late);
      act(() => {
        vi.advanceTimersByTime(500);
      });

      expect(screen.getByTestId('active-tab')).toHaveTextContent(SETTINGS_TAB.INTEGRATIONS);
      view.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does nothing until Settings has loaded', () => {
    renderAt('/settings#connected-apps', false);

    expect(screen.getByTestId('active-tab')).toHaveTextContent(SETTINGS_TAB.EMAIL);
  });
});
