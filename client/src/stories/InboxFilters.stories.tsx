/**
 * InboxFilters stories — the inbox filter bar and the lists inside its menus.
 *
 * - Filter bar: default, multi-account, with a selection, loading, phone width
 * - Menus shown open: category, long category list (search box), priority
 */
import React, { useState } from 'react';
import { I18nextProvider } from 'react-i18next';
import type { Meta, StoryObj } from '@storybook/react';

import { CategoryCheckboxList } from 'components/inbox/CategoryCheckboxList';
import { FilterMenu } from 'components/inbox/FilterMenu';
import { InboxFilters } from 'components/inbox/InboxFilters';
import { PriorityCheckboxFilter } from 'components/inbox/PriorityCheckboxFilter';
import type { InboxFilter } from 'hooks/useInboxFilters';

import { inboxFiltersI18n } from './storyHelpers/i18nInstances';

// ── Mock data ─────────────────────────────────────────────────────────────────

const MOCK_ACCOUNTS = [
  { id: 'acc-1', email: 'alice@example.com', provider: 'gmail' as const, isPrimary: true, isActive: true },
  { id: 'acc-2', email: 'alice@work.com', provider: 'office365' as const, isPrimary: false, isActive: true },
];

const MOCK_CATEGORIES_MANY = [
  { id: 'cat-uuid-1', label: 'Newsletters' },
  { id: 'cat-uuid-2', label: 'Receipts' },
  { id: 'cat-uuid-3', label: 'Updates' },
  { id: 'cat-uuid-4', label: 'Social' },
  { id: 'cat-uuid-5', label: 'Finance' },
  { id: 'cat-uuid-6', label: 'Travel' },
  { id: 'cat-uuid-7', label: 'Work' },
  { id: 'cat-uuid-8', label: 'Personal' },
];

/** Mock per-category email counts for stories. */
const MOCK_CATEGORY_COUNTS: Record<string, number> = {
  'cat-uuid-1': 12,
  'cat-uuid-2': 5,
  'cat-uuid-3': 28,
  'cat-uuid-4': 7,
  'cat-uuid-5': 3,
  'cat-uuid-6': 14,
  'cat-uuid-7': 9,
  'cat-uuid-8': 21,
};

const MOCK_BUCKET_COUNTS: Record<string, number> = {
  'Very Low': 3,
  Low: 12,
  Medium: 28,
  High: 14,
  'Very High': 7,
};

const DEFAULT_FILTERS = {
  accountIds: [] as string[],
  categories: [] as string[],
  minPriority: 80 as number | null,
  maxPriority: null as number | null,
};

const MOCK_CATEGORIES_LONG = [
  ...MOCK_CATEGORIES_MANY,
  { id: 'cat-uuid-9', label: 'Clients' },
  { id: 'cat-uuid-10', label: 'GitHub' },
];

const HIGH_AND_ABOVE: InboxFilter = { accountIds: [], categories: [], minPriority: 30, maxPriority: null };

/** Room below the bar or button so an open menu is inside the story frame. */
const MENU_ROOM = '420px';

// ── Stateful wrappers ─────────────────────────────────────────────────────────

interface InboxFiltersDemoProps {
  connectedAccounts?: typeof MOCK_ACCOUNTS;
  availableCategories?: Array<{ id: string; label: string }>;
  initialFilters?: InboxFilter;
  loading?: boolean;
  width?: string;
}

const InboxFiltersDemo: React.FC<InboxFiltersDemoProps> = ({
  connectedAccounts = [MOCK_ACCOUNTS[0]],
  availableCategories = MOCK_CATEGORIES_MANY,
  initialFilters = HIGH_AND_ABOVE,
  loading = false,
  width = '900px',
}) => {
  const [filters, setFilters] = useState(initialFilters);
  return (
    <I18nextProvider i18n={inboxFiltersI18n}>
      <div style={{ width, maxWidth: '100%', minHeight: MENU_ROOM }}>
        <InboxFilters
          isFilterBarVisible
          filters={filters}
          connectedAccounts={connectedAccounts}
          availableCategories={availableCategories}
          loadingAccounts={loading}
          loadingCategories={loading}
          hasActiveFilters
          setAccountFilter={accountIds => setFilters(prev => ({ ...prev, accountIds }))}
          setCategoryFilter={categories => setFilters(prev => ({ ...prev, categories }))}
          onPriorityChange={(minPriority, maxPriority) => setFilters(prev => ({ ...prev, minPriority, maxPriority }))}
          onCollapse={() => {
            /* no-op in Storybook */
          }}
          categoryCounts={MOCK_CATEGORY_COUNTS}
          bucketCounts={MOCK_BUCKET_COUNTS}
          priorityTotalCount={21}
        />
      </div>
    </I18nextProvider>
  );
};

const CategoryMenuDemo: React.FC<{ categories: Array<{ id: string; label: string }>; initialSelectedIds: string[] }> = ({
  categories,
  initialSelectedIds,
}) => {
  const [selectedIds, setSelectedIds] = useState(initialSelectedIds);
  return (
    <I18nextProvider i18n={inboxFiltersI18n}>
      <div style={{ display: 'flex', alignItems: 'flex-start', minHeight: MENU_ROOM }}>
        <FilterMenu
          label="Category"
          summary={selectedIds.length > 0 ? `${selectedIds.length} selected` : 'All'}
          isFiltering={selectedIds.length > 0}
          defaultOpen
        >
          <CategoryCheckboxList
            categories={categories}
            selectedIds={selectedIds}
            onChange={setSelectedIds}
            categoryCounts={MOCK_CATEGORY_COUNTS}
          />
        </FilterMenu>
      </div>
    </I18nextProvider>
  );
};

const PriorityMenuDemo: React.FC<{ touch?: boolean }> = ({ touch = false }) => {
  const [range, setRange] = useState<{ min: number | null; max: number | null }>({ min: 30, max: null });
  return (
    <I18nextProvider i18n={inboxFiltersI18n}>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          position: 'relative',
          width: touch ? '375px' : undefined,
          minHeight: MENU_ROOM,
        }}
      >
        <FilterMenu label="Priority" summary="High and above" isFiltering defaultOpen touch={touch}>
          <PriorityCheckboxFilter
            selectedMin={range.min}
            selectedMax={range.max}
            onChange={(min, max) => setRange({ min, max })}
            bucketCounts={MOCK_BUCKET_COUNTS}
            totalCount={21}
            touch={touch}
          />
        </FilterMenu>
      </div>
    </I18nextProvider>
  );
};

// ── Stories ───────────────────────────────────────────────────────────────────

const meta: Meta<typeof InboxFiltersDemo> = {
  title: 'Inbox/InboxFilters',
  component: InboxFiltersDemo,
  parameters: { layout: 'padded' },
};
export default meta;

type Story = StoryObj<typeof InboxFiltersDemo>;

export const FilterBar: Story = { name: 'Filter bar (single account)' };

export const FilterBarMultiAccount: Story = {
  name: 'Filter bar (several accounts)',
  args: { connectedAccounts: MOCK_ACCOUNTS },
};

export const FilterBarWithSelection: Story = {
  name: 'Filter bar (categories and a priority range selected)',
  args: {
    connectedAccounts: MOCK_ACCOUNTS,
    initialFilters: { accountIds: [], categories: ['cat-uuid-1', 'cat-uuid-2'], minPriority: 0, maxPriority: 50 },
  },
};

export const FilterBarLoading: Story = {
  name: 'Filter bar (categories loading)',
  args: { availableCategories: [], loading: true },
};

export const FilterBarPhone: Story = {
  name: 'Filter bar (phone width)',
  // Fullscreen so the bar gets the phone's whole width, as it does in the inbox.
  parameters: { layout: 'fullscreen', viewport: { defaultViewport: 'mobile1' } },
  args: { width: '375px' },
};

export const CategoryMenuOpen: StoryObj = {
  name: 'Category menu (open)',
  render: () => <CategoryMenuDemo categories={MOCK_CATEGORIES_MANY} initialSelectedIds={['cat-uuid-1', 'cat-uuid-2']} />,
};

export const CategoryMenuLongList: StoryObj = {
  name: 'Category menu (long list with search)',
  render: () => <CategoryMenuDemo categories={MOCK_CATEGORIES_LONG} initialSelectedIds={[]} />,
};

export const PriorityMenuOpen: StoryObj = {
  name: 'Priority menu (open)',
  render: () => <PriorityMenuDemo />,
};

export const PriorityMenuPhone: StoryObj = {
  name: 'Priority menu (phone width)',
  render: () => <PriorityMenuDemo touch />,
};
