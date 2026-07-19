/**
 * TeamSettingsSection stories — uses the real TeamSettingsSection component.
 * Data is seeded via React Query cache to avoid live network calls in Storybook.
 */
import type { Meta, StoryObj } from '@storybook/react';

import { TeamSettingsDemo } from './storyHelpers/TeamSettingsDemo';

const meta: Meta<typeof TeamSettingsDemo> = {
  title: 'Settings/TeamSettingsSection',
  component: TeamSettingsDemo,
  parameters: { layout: 'padded' },
};
export default meta;
type Story = StoryObj<typeof TeamSettingsDemo>;

export const WithOrg: Story = {
  name: 'With org — normal usage',
  args: {
    hasOrg: true,
    activeSeats: 2,
    maxSeats: 5,
    emailsUsed: 1200,
    emailLimit: 3000,
    tier: 'bearlymail_starter',
  },
};

export const VolumeWarning: Story = {
  name: 'With org — 80% volume warning',
  args: {
    hasOrg: true,
    activeSeats: 3,
    maxSeats: 5,
    emailsUsed: 2500,
    emailLimit: 3000,
    tier: 'bearlymail_starter',
  },
};

export const VolumeCritical: Story = {
  name: 'With org — volume limit reached',
  args: {
    hasOrg: true,
    activeSeats: 5,
    maxSeats: 5,
    emailsUsed: 3000,
    emailLimit: 3000,
    tier: 'bearlymail_starter',
  },
};

export const NoOrg: Story = {
  name: 'No organisation',
  args: {
    hasOrg: false,
  },
};

export const GrowthTier: Story = {
  name: 'Growth tier — 10K limit',
  args: {
    hasOrg: true,
    activeSeats: 4,
    maxSeats: 10,
    emailsUsed: 4500,
    emailLimit: 10000,
    tier: 'bearlymail_growth',
  },
};
