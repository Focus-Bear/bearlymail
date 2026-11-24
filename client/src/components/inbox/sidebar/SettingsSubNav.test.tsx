import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SettingsSubNav } from 'components/inbox/Sidebar';
import { SETTINGS_TAB, SETTINGS_TABS } from 'components/settings/settings-tabs';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('hooks/useCrmPlanAccess', () => ({ useCrmPlanAccess: () => ({ isCrmIncluded: true }) }));

describe('SettingsSubNav', () => {
  it('lists one link per Settings tab, with the open tab marked', () => {
    render(<SettingsSubNav activeTab={SETTINGS_TAB.AI} onSelect={vi.fn()} />);

    const links = screen.getAllByRole('button');
    expect(links.map(link => link.textContent)).toEqual(SETTINGS_TABS.map(tab => tab.labelKey));
    expect(screen.getByRole('button', { name: 'settings.nav.guideOurAI' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'settings.nav.emailDelivery' })).not.toHaveAttribute('aria-current');
  });

  it('opens the clicked tab, then lets the sidebar close on a phone', async () => {
    const onSelect = vi.fn();
    const onAfterSelect = vi.fn();
    render(<SettingsSubNav activeTab={SETTINGS_TAB.EMAIL} onSelect={onSelect} onAfterSelect={onAfterSelect} />);

    await userEvent.click(screen.getByRole('button', { name: 'settings.nav.schedulingPreferences' }));

    expect(onSelect).toHaveBeenCalledWith(SETTINGS_TAB.SCHEDULING);
    expect(onAfterSelect).toHaveBeenCalled();
  });
});
