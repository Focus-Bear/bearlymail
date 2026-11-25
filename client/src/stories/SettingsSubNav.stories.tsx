/**
 * The Settings links in the sidebar (#482): one link per Settings tab, the
 * open tab highlighted, instead of every section in seven groups.
 */
import React, { useState } from 'react';
import { I18nextProvider } from 'react-i18next';
import type { Meta, StoryObj } from '@storybook/react';
import i18n from 'i18n';

import { SettingsSubNav } from 'components/inbox/Sidebar';
import { SETTINGS_TAB, type SettingsTabId } from 'components/settings/settings-tabs';

const SIDEBAR_WIDTH_PX = 220;

const InteractiveSubNav: React.FC<{ initialTab: SettingsTabId }> = ({ initialTab }) => {
  const [activeTab, setActiveTab] = useState<SettingsTabId>(initialTab);
  return (
    <I18nextProvider i18n={i18n}>
      <div
        style={{
          width: `${SIDEBAR_WIDTH_PX}px`,
          background: '#FFFFFF',
          border: '1px solid #E5E7EB',
          borderRadius: '8px',
          padding: '12px 8px',
        }}
      >
        <SettingsSubNav activeTab={activeTab} onSelect={setActiveTab} />
      </div>
    </I18nextProvider>
  );
};

const meta: Meta = {
  title: 'Inbox/Sidebar/SettingsSubNav',
  parameters: {
    layout: 'centered',
    backgrounds: { default: 'light gray' },
  },
};

export default meta;
type Story = StoryObj;

export const EmailTabOpen: Story = {
  render: () => <InteractiveSubNav initialTab={SETTINGS_TAB.EMAIL} />,
};

export const ScheduleTabOpen: Story = {
  render: () => <InteractiveSubNav initialTab={SETTINGS_TAB.SCHEDULING} />,
};
