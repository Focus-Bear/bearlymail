/**
 * SplitViewPanelShell stories — renders the panel header/actions shell directly
 * without any routing, Redux, or API dependencies (issue #1219).
 *
 * The email detail body is injected via children. In production SplitViewPanel passes
 * <EmailDetail>; here we pass a simple mock pane (see storyHelpers/SplitViewShellDemo).
 */
import type { Meta, StoryObj } from '@storybook/react';

import { ShellDemo } from './storyHelpers/SplitViewShellDemo';

const meta: Meta<typeof ShellDemo> = {
  title: 'Inbox/SplitViewPanelShell',
  component: ShellDemo,
  parameters: { layout: 'padded' },
};
export default meta;
type Story = StoryObj<typeof ShellDemo>;

export const Default: Story = {
  name: 'Default — email selected',
  args: { showEmail: true },
};

export const NoEmailSelected: Story = {
  name: 'No email selected',
  args: { showEmail: false },
};

export const PriorityGetOnIt: Story = {
  name: 'Priority — Get on it (★★)',
  args: { showEmail: true, starCount: 2 },
};

export const SnoozeOpen: Story = {
  name: 'Snooze input open',
  args: { showEmail: true, showSnoozeInput: true },
};

export const PanelExpanded: Story = {
  name: 'Panel expanded (full width)',
  args: { showEmail: true, panelExpanded: true },
};
