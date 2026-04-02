/**
 * DebugPrioritySection stories — visual preview of the priority debug panel section.
 *
 * Covers:
 * 1. All priorities (no filter)
 * 2. Very High filter active
 * 3. Custom range (Medium–High)
 * 4. With categories
 *
 * Author: Captain Codebeard (AI)
 * Implements: #1571 Feature — Priority debug section (P3)
 */
import type { Meta, StoryObj } from '@storybook/react';

import { DebugPrioritySection } from 'components/inbox/debug/DebugPrioritySection';

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
    filters: ALL_FILTER,
    priorityTotalCount: 84,
  },
};

export const VeryHighFilter: Story = {
  args: {
    filters: VH_FILTER,
    priorityTotalCount: 84,
  },
};

export const MediumToHighRange: Story = {
  args: {
    filters: MID_FILTER,
    priorityTotalCount: 84,
  },
};

export const WithCategories: Story = {
  args: {
    filters: {
      ...VH_FILTER,
      categories: ['uuid-abc-123', 'uuid-def-456'],
      accountIds: ['acc-1'],
    },
    priorityTotalCount: 84,
  },
};
