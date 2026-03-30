/**
 * DebugPrioritySection stories — visual preview of the priority debug panel section.
 *
 * Covers:
 * 1. All priorities (no filter)
 * 2. Very High filter active
 * 3. Custom range (Medium–High)
 * 4. With cache hit
 * 5. Loading (no priority counts)
 *
 * Author: Captain Codebeard (AI)
 * Implements: #1571 Feature — Priority debug section (P3)
 */
import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';

import { DebugPrioritySection } from 'components/inbox/debug/DebugPrioritySection';

const MOCK_COUNTS = {
  veryHigh: 12,
  high: 34,
  medium: 22,
  low: 8,
  veryLow: 3,
  unprioritised: 5,
};

const ALL_FILTER = {
  accountIds: [],
  categories: [],
  minPriority: null,
  maxPriority: null,
};

const VH_FILTER = {
  accountIds: [],
  categories: [],
  minPriority: 50,
  maxPriority: null,
};

const MID_FILTER = {
  accountIds: [],
  categories: [],
  minPriority: 15,
  maxPriority: 50,
};

const meta: Meta<typeof DebugPrioritySection> = {
  title: 'Inbox/Debug/DebugPrioritySection',
  component: DebugPrioritySection,
  parameters: { layout: 'padded' },
};

export default meta;

type Story = StoryObj<typeof DebugPrioritySection>;

export const AllPriorities: Story = {
  args: {
    mode: 'triage',
    filters: ALL_FILTER,
    priorityCounts: MOCK_COUNTS,
  },
};

export const VeryHighFilter: Story = {
  args: {
    mode: 'triage',
    filters: VH_FILTER,
    priorityCounts: MOCK_COUNTS,
  },
};

export const MediumToHighRange: Story = {
  args: {
    mode: 'action',
    filters: MID_FILTER,
    priorityCounts: MOCK_COUNTS,
  },
};

export const NoPriorityCounts: Story = {
  args: {
    mode: 'triage',
    filters: ALL_FILTER,
    priorityCounts: null,
  },
};

export const WithCategories: Story = {
  args: {
    mode: 'triage',
    filters: {
      ...VH_FILTER,
      categories: ['uuid-abc-123', 'uuid-def-456'],
      accountIds: ['acc-1'],
    },
    priorityCounts: { ...MOCK_COUNTS, unprioritised: 0 },
  },
};
