/**
 * Settings declutter (#482): the delivery schedule as a sentence with presets,
 * a closed "Advanced" section, and settings that save themselves (no Save
 * buttons). Saves are faked with a short delay so "Saving…" / "Saved ✓" show.
 */
import React, { useState } from 'react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import type { Meta, StoryObj } from '@storybook/react';
import i18n from 'i18n';
import { theme } from 'theme/theme';

import { AdvancedSettings } from 'components/settings/AdvancedSettings';
import { EmailBatchingSection } from 'components/settings/email-delivery/EmailBatchingSection';
import { EmailSignatureSection } from 'components/settings/EmailSignatureSection';
import { ProfileSettingsSection } from 'components/settings/guide-ai/ProfileSettingsSection';
import type { BatchSchedule } from 'hooks/settings/useBatchSchedule';

const SETTINGS_COLUMN_MAX_WIDTH = 760;
const FAKE_SAVE_MS = 400;

const fakeSave = () => new Promise<void>(resolve => setTimeout(resolve, FAKE_SAVE_MS));

const DeliverySchedule: React.FC = () => {
  const [schedule, setSchedule] = useState<BatchSchedule>({
    deliveryDays: [1, 2, 3, 4, 5],
    deliveryTimes: ['11:00', '15:00'],
    timezone: 'Australia/Melbourne',
    isEnabled: true,
    urgentBypassSchedule: true,
  });
  const [newTime, setNewTime] = useState('');
  return (
    <EmailBatchingSection
      batchSchedule={schedule}
      newDeliveryTime={newTime}
      onBatchScheduleChange={setSchedule}
      onNewDeliveryTimeChange={setNewTime}
      onSaveBatchSchedule={async () => {
        await fakeSave();
        return true;
      }}
    />
  );
};

const Signature: React.FC = () => {
  const [signature, setSignature] = useState('Daniel\nSent from BearlyMail');
  return <EmailSignatureSection emailSignature={signature} onSignatureChange={setSignature} onSave={fakeSave} />;
};

const meta: Meta = {
  title: 'Settings/Declutter',
  decorators: [
    Story => (
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/settings']}>
          <div
            style={{
              maxWidth: SETTINGS_COLUMN_MAX_WIDTH,
              padding: theme.spacing.md,
              backgroundColor: theme.colors.background.default,
            }}
          >
            <Story />
          </div>
        </MemoryRouter>
      </I18nextProvider>
    ),
  ],
};

export default meta;
type Story = StoryObj;

export const DeliveryScheduleCard: Story = { render: () => <DeliverySchedule /> };

export const Advanced: Story = {
  render: () => (
    <AdvancedSettings summary={i18n.t('settings.advanced.scheduling')}>
      <p>Meeting length and time zone pickers go here.</p>
    </AdvancedSettings>
  ),
};

export const Profile: Story = {
  render: () => (
    <ProfileSettingsSection displayName="Daniel" jobTitle="Developer" calendarBookingUrl="" onUpdate={fakeSave} />
  ),
};

export const EmailSignature: Story = { render: () => <Signature /> };
