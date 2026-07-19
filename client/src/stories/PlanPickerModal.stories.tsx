/**
 * PlanPickerModal.stories.tsx — Storybook stories for the in-app plan picker.
 *
 * Four scenarios:
 *   1. Default      — trial org, owner/admin, RevenueCat key configured → buy buttons
 *   2. CurrentPlan  — active Growth plan highlighted with a "Current plan" badge
 *   3. MemberView   — plain org member: read-only tiers + "ask your org owner" note
 *   4. Fallback     — no VITE_REVENUECAT_API_KEY → contact-us mailto CTA + note
 *
 * All stories render the REAL PlanPickerModal; tiers are supplied via React
 * Query cache seeding (see PlanPickerModalDemo).
 */
import type { Meta, StoryObj } from '@storybook/react';

import { PlanPickerModalDemo } from './storyHelpers/PlanPickerModalDemo';

const meta: Meta<typeof PlanPickerModalDemo> = {
  title: 'Settings/PlanPickerModal',
  component: PlanPickerModalDemo,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Modal listing the purchasable volume tiers. Owners/admins with a configured RevenueCat Web Billing key get in-app checkout; without a key the action falls back to a contact-us mailto; members see the tiers read-only.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof PlanPickerModalDemo>;

export const Default: Story = {
  name: 'Default — owner on trial, checkout enabled',
  args: { scenario: 'default' },
};

export const CurrentPlan: Story = {
  name: 'Current plan — active Growth tier highlighted',
  args: { scenario: 'currentPlan' },
};

export const MemberView: Story = {
  name: 'Member view — read-only with upgrade hint',
  args: { scenario: 'member' },
};

export const Fallback: Story = {
  name: 'Fallback — no RevenueCat key, contact-us CTA',
  args: { scenario: 'fallback' },
};
