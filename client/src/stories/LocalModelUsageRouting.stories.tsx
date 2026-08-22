/**
 * BreakdownTable — the priority / category routing tables in the Local Model
 * Usage admin panel. The "Unprocessed" row now splits into indented
 * Deferred + Awaiting-scoring sub-rows.
 *
 * For static screenshots: `cd client && npm run build-storybook`, open `storybook-static/index.html`.
 */
import React from 'react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import type { Meta, StoryObj } from '@storybook/react';
import i18n from 'i18n';

import { BreakdownTable, buildCategoryRows, buildPriorityRows } from 'components/admin/LocalModelUsageSection';
import type { CategoryUsage, PriorityUsage } from 'components/admin/useLocalModelUsageData';

const meta: Meta<typeof BreakdownTable> = {
  title: 'Admin/LocalModelUsageRouting',
  component: BreakdownTable,
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof BreakdownTable>;

const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <I18nextProvider i18n={i18n}>
    <MemoryRouter>
      <div style={{ maxWidth: 700, margin: '0 auto' }}>{children}</div>
    </MemoryRouter>
  </I18nextProvider>
);

const PRIORITY: PriorityUsage = {
  local: 6820,
  llm: 1240,
  rule: 460,
  unprocessed: 980,
  deferred: 720,
  pending: 260,
  total: 9500,
  localPct: 72,
  llmPct: 13,
};

const CATEGORY: CategoryUsage = {
  local: 5210,
  llm: 2680,
  rule: 610,
  unprocessed: 1000,
  deferred: 640,
  pending: 360,
  total: 9500,
  localPct: 55,
};

/** Priority + category routing tables with the Deferred / Awaiting-scoring split under Unprocessed */
export const PriorityAndCategory: Story = {
  render: () => (
    <Wrapper>
      <BreakdownTable
        title={i18n.t('admin.localModel.priorityTitle')}
        totalLabel={i18n.t('admin.localModel.total')}
        total={PRIORITY.total}
        rows={buildPriorityRows(PRIORITY, i18n.t)}
      />
      <BreakdownTable
        title={i18n.t('admin.localModel.categoryTitle')}
        totalLabel={i18n.t('admin.localModel.total')}
        total={CATEGORY.total}
        rows={buildCategoryRows(CATEGORY, i18n.t)}
      />
    </Wrapper>
  ),
};
