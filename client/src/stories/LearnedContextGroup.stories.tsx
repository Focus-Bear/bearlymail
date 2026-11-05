/**
 * Onboarding "What we learned" group — VIP chips explain why each contact was
 * picked: hover or focus a VIP to see the reason onboarding recorded.
 */
import React from 'react';
import { I18nextProvider } from 'react-i18next';
import type { Meta, StoryObj } from '@storybook/react';
import i18n from 'i18n';

import { LEARNED_GROUPS } from 'components/setup-wizard/learned-context/learned-context';
import { LearnedContextGroup } from 'components/setup-wizard/learned-context/LearnedContextGroup';

const IMPORTANT_GROUP = LEARNED_GROUPS[0];

const MOCK_ITEMS = [
  {
    contextId: 'vip-1',
    contextKey: 'VIP_CONTACT',
    contextValue: 'Priya Raman',
    explanation: 'Client you reply to about the Northwind onboarding rollout',
  },
  {
    contextId: 'vip-2',
    contextKey: 'VIP_CONTACT',
    contextValue: 'Tom Becker',
    explanation: 'Your manager — writes to you personally about the Q4 roadmap',
  },
  { contextId: 'goal-1', contextKey: 'MY_GOALS', contextValue: 'Close the Series A' },
];

const noop = () => undefined;

const meta: Meta<typeof LearnedContextGroup> = {
  title: 'SetupWizard/LearnedContextGroup',
  component: LearnedContextGroup,
  parameters: { layout: 'padded' },
  decorators: [
    Story => (
      <I18nextProvider i18n={i18n}>
        <div style={{ maxWidth: 520, paddingTop: 72 }}>
          <Story />
        </div>
      </I18nextProvider>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof LearnedContextGroup>;

export const VipReasons: Story = {
  args: { group: IMPORTANT_GROUP, items: MOCK_ITEMS, onAdd: noop, onUpdate: noop, onRemove: noop },
};
