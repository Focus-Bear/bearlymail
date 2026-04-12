/**
 * InboxFilters stories — covers PriorityRangeSelector, VisualCategoryFilter,
 * and the composed InboxFilters component.
 *
 * Covers:
 * 1. PriorityRangeSelector — All (no filter)
 * 2. PriorityRangeSelector — Very High only (new-user default)
 * 3. PriorityRangeSelector — Mid-range selection
 * 4. PriorityRangeSelector — With bucket counts
 * 5. PriorityRangeSelector — Interactive (controls)
 * 6. VisualCategoryFilter — Empty (no categories)
 * 7. VisualCategoryFilter — 3 categories, none selected
 * 8. VisualCategoryFilter — Multiple selected
 * 9. VisualCategoryFilter — Overflow (8 categories)
 * 10. InboxFilters — Full filter bar (multi-account + categories)
 * 11. InboxFilters — Single account (account filter hidden)
 * 12. InboxFilters — Loading states
 * 13. VisualCategoryFilter — Compact/mobile (reduced padding, ≥44px touch targets) [PR #1486]
 * 14. VisualCategoryFilter — Compact overflow dropdown [PR #1486]
 * 15. InboxFilters — Mobile viewport (375px): stacked layout [PR #1486]
 * 16. InboxFilters — Tablet viewport (768px): side-by-side layout [PR #1486]
 *
 * Implemented for issue #1414 (visual filters).
 * Mobile responsive layout added in PR #1486 (fix #1477).
 */
import React, { useState } from 'react';
import { I18nextProvider } from 'react-i18next';
import type { Meta, StoryObj } from '@storybook/react';

import { InboxFilters } from 'components/inbox/InboxFilters';
import { PriorityRangeSelector } from 'components/inbox/PriorityRangeSelector';
import { VisualCategoryFilter } from 'components/inbox/VisualCategoryFilter';

import { inboxFiltersI18n } from './storyHelpers/i18nInstances';

// ── Mock data ─────────────────────────────────────────────────────────────────

const MOCK_ACCOUNTS = [
  { id: 'acc-1', email: 'alice@example.com', provider: 'gmail' as const, isPrimary: true, isActive: true },
  { id: 'acc-2', email: 'alice@work.com', provider: 'office365' as const, isPrimary: false, isActive: true },
];

const MOCK_CATEGORIES_FEW = [
  { id: 'cat-uuid-1', label: 'Newsletters' },
  { id: 'cat-uuid-2', label: 'Receipts' },
  { id: 'cat-uuid-3', label: 'Updates' },
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

// ── Stateful wrappers ─────────────────────────────────────────────────────────

interface PriorityRangeSelectorDemoProps {
  selectedMin: number | null;
  selectedMax: number | null;
  showCounts?: boolean;
}

const PriorityRangeSelectorDemo: React.FC<PriorityRangeSelectorDemoProps> = ({
  selectedMin: initialMin,
  selectedMax: initialMax,
  showCounts = false,
}) => {
  const [min, setMin] = useState<number | null>(initialMin);
  const [max, setMax] = useState<number | null>(initialMax);
  return (
    <I18nextProvider i18n={inboxFiltersI18n}>
      <div style={{ padding: '24px', maxWidth: '480px' }}>
        <PriorityRangeSelector
          selectedMin={min}
          selectedMax={max}
          onChange={(newMin, newMax) => {
            setMin(newMin);
            setMax(newMax);
          }}
          bucketCounts={showCounts ? MOCK_BUCKET_COUNTS : undefined}
          totalCount={showCounts ? 64 : undefined}
        />
        <p style={{ marginTop: '12px', fontSize: '12px', color: '#666' }}>
          min={min ?? 'null'}, max={max ?? 'null'}
        </p>
      </div>
    </I18nextProvider>
  );
};

interface VisualCategoryFilterDemoProps {
  categories: Array<{ id: string; label: string }>;
  initialSelectedIds?: string[];
  categoryCounts?: Record<string, number>;
}

const VisualCategoryFilterDemo: React.FC<VisualCategoryFilterDemoProps> = ({
  categories,
  initialSelectedIds = [],
  categoryCounts,
}) => {
  const [selectedIds, setSelectedIds] = useState<string[]>(initialSelectedIds);
  return (
    <I18nextProvider i18n={inboxFiltersI18n}>
      <div style={{ padding: '24px', maxWidth: '600px' }}>
        <VisualCategoryFilter
          categories={categories}
          selectedIds={selectedIds}
          onChange={setSelectedIds}
          categoryCounts={categoryCounts}
        />
        <p style={{ marginTop: '12px', fontSize: '12px', color: '#666' }}>selected: [{selectedIds.join(', ')}]</p>
      </div>
    </I18nextProvider>
  );
};

interface InboxFiltersDemoProps {
  connectedAccounts: typeof MOCK_ACCOUNTS;
  availableCategories: typeof MOCK_CATEGORIES_FEW;
  loadingAccounts?: boolean;
  loadingCategories?: boolean;
  initialMinPriority?: number | null;
  initialMaxPriority?: number | null;
  categoryCounts?: Record<string, number>;
  bucketCounts?: Record<string, number>;
}

const InboxFiltersDemo: React.FC<InboxFiltersDemoProps> = ({
  connectedAccounts,
  availableCategories,
  loadingAccounts = false,
  loadingCategories = false,
  initialMinPriority = 80,
  initialMaxPriority = null,
  categoryCounts,
  bucketCounts,
}) => {
  const [filters, setFilters] = useState({
    ...DEFAULT_FILTERS,
    minPriority: initialMinPriority,
    maxPriority: initialMaxPriority,
  });

  const hasActiveFilters =
    filters.accountIds.length > 0 ||
    filters.categories.length > 0 ||
    filters.minPriority !== null ||
    filters.maxPriority !== null;

  return (
    <I18nextProvider i18n={inboxFiltersI18n}>
      <div style={{ maxWidth: '900px' }}>
        <InboxFilters
          isFilterBarVisible
          filters={filters}
          connectedAccounts={connectedAccounts}
          availableCategories={availableCategories}
          loadingAccounts={loadingAccounts}
          loadingCategories={loadingCategories}
          hasActiveFilters={hasActiveFilters}
          setAccountFilter={ids => setFilters(prev => ({ ...prev, accountIds: ids }))}
          setCategoryFilter={cats => setFilters(prev => ({ ...prev, categories: cats }))}
          setPriorityFilter={(min, max = null) => setFilters(prev => ({ ...prev, minPriority: min, maxPriority: max }))}
          onFilterChange={() => {
            /* no-op in Storybook */
          }}
          categoryCounts={categoryCounts}
          bucketCounts={bucketCounts}
          priorityTotalCount={
            bucketCounts ? Object.values(bucketCounts).reduce((bucketA, bucketB) => bucketA + bucketB, 0) : undefined
          }
        />
      </div>
    </I18nextProvider>
  );
};

// ── PriorityRangeSelector stories ─────────────────────────────────────────────

const priorityMeta: Meta<typeof PriorityRangeSelectorDemo> = {
  title: 'Inbox/PriorityRangeSelector',
  component: PriorityRangeSelectorDemo,
  parameters: { layout: 'padded' },
  argTypes: {
    selectedMin: {
      control: { type: 'number' },
      description: 'Minimum priority value (null = 0 / no lower bound)',
    },
    selectedMax: {
      control: { type: 'number' },
      description: 'Maximum priority value (null = 100 / no upper bound)',
    },
  },
};
export default priorityMeta;

type PriorityStory = StoryObj<typeof PriorityRangeSelectorDemo>;

export const AllPriorities: PriorityStory = {
  name: 'All (no filter)',
  args: { selectedMin: null, selectedMax: null },
};

export const VeryHighSelected: PriorityStory = {
  name: 'Very High only (new-user default)',
  args: { selectedMin: 80, selectedMax: null },
};

export const MidRangeSelected: PriorityStory = {
  name: 'Mid range (Low → High)',
  args: { selectedMin: 20, selectedMax: 80 },
};

export const WithBucketCounts: PriorityStory = {
  name: 'With bucket counts',
  args: { selectedMin: 40, selectedMax: null, showCounts: true },
};

export const Interactive: PriorityStory = {
  name: 'Interactive (controls)',
  args: { selectedMin: 60, selectedMax: null },
};

// ── VisualCategoryFilter stories ──────────────────────────────────────────────

export const CategoryEmpty: StoryObj = {
  name: 'Category — empty (no categories)',
  render: () => <VisualCategoryFilterDemo categories={[]} />,
};

export const CategoryFewNoneSelected: StoryObj = {
  name: 'Category — 3 categories, none selected',
  render: () => <VisualCategoryFilterDemo categories={MOCK_CATEGORIES_FEW} categoryCounts={MOCK_CATEGORY_COUNTS} />,
};

export const CategorySomeSelected: StoryObj = {
  name: 'Category — multiple selected (with counts + tick)',
  render: () => (
    <VisualCategoryFilterDemo
      categories={MOCK_CATEGORIES_FEW}
      initialSelectedIds={['cat-uuid-1', 'cat-uuid-3']}
      categoryCounts={MOCK_CATEGORY_COUNTS}
    />
  ),
};

export const CategoryOverflow: StoryObj = {
  name: 'Category — overflow (8 categories, with counts)',
  render: () => <VisualCategoryFilterDemo categories={MOCK_CATEGORIES_MANY} categoryCounts={MOCK_CATEGORY_COUNTS} />,
};

export const CategorySelectedWithOverflowOpen: StoryObj = {
  name: 'Category — selected + overflow open (tick marks visible)',
  render: () => (
    <I18nextProvider i18n={inboxFiltersI18n}>
      <div style={{ padding: '24px', maxWidth: '600px' }}>
        {/* Stateful wrapper so overflow items can also be selected */}
        <VisualCategoryFilterDemo
          categories={MOCK_CATEGORIES_MANY}
          initialSelectedIds={['cat-uuid-1', 'cat-uuid-6', 'cat-uuid-7']}
          categoryCounts={MOCK_CATEGORY_COUNTS}
        />
        <p style={{ marginTop: '8px', fontSize: '12px', color: '#666' }}>
          Click &quot;+ 3 more&quot; to open overflow dropdown; selected items show ✓ tick.
        </p>
      </div>
    </I18nextProvider>
  ),
};

// ── InboxFilters stories ──────────────────────────────────────────────────────

export const FullFilterBar: StoryObj = {
  name: 'Full filter bar (multi-account + categories + counts)',
  render: () => (
    <InboxFiltersDemo
      connectedAccounts={MOCK_ACCOUNTS}
      availableCategories={MOCK_CATEGORIES_MANY}
      initialMinPriority={80}
      initialMaxPriority={null}
      categoryCounts={MOCK_CATEGORY_COUNTS}
      bucketCounts={MOCK_BUCKET_COUNTS}
    />
  ),
};

const FullFilterBarCategoriesSelectedDemo: React.FC = () => {
  const [filters, setFilters] = React.useState({
    accountIds: [] as string[],
    categories: ['cat-uuid-1', 'cat-uuid-3'] as string[],
    minPriority: 40 as number | null,
    maxPriority: 80 as number | null,
  });
  const hasActiveFilters =
    filters.accountIds.length > 0 ||
    filters.categories.length > 0 ||
    filters.minPriority !== null ||
    filters.maxPriority !== null;
  return (
    <I18nextProvider i18n={inboxFiltersI18n}>
      <div style={{ maxWidth: '900px' }}>
        <InboxFilters
          isFilterBarVisible
          filters={filters}
          connectedAccounts={MOCK_ACCOUNTS}
          availableCategories={MOCK_CATEGORIES_FEW}
          loadingAccounts={false}
          loadingCategories={false}
          hasActiveFilters={hasActiveFilters}
          setAccountFilter={ids => setFilters(prev => ({ ...prev, accountIds: ids }))}
          setCategoryFilter={cats => setFilters(prev => ({ ...prev, categories: cats }))}
          setPriorityFilter={(min, max = null) => setFilters(prev => ({ ...prev, minPriority: min, maxPriority: max }))}
          onFilterChange={() => {
            /* no-op */
          }}
          categoryCounts={MOCK_CATEGORY_COUNTS}
          bucketCounts={MOCK_BUCKET_COUNTS}
          priorityTotalCount={Object.values(MOCK_BUCKET_COUNTS).reduce((bucketA, bucketB) => bucketA + bucketB, 0)}
        />
      </div>
    </I18nextProvider>
  );
};

export const FullFilterBarCategoriesSelected: StoryObj = {
  name: 'Full filter bar — categories selected (tick marks + 2-row layout)',
  render: () => <FullFilterBarCategoriesSelectedDemo />,
};

export const SingleAccount: StoryObj = {
  name: 'Single account (account filter hidden, 2-col layout)',
  render: () => (
    <InboxFiltersDemo
      connectedAccounts={[MOCK_ACCOUNTS[0]]}
      availableCategories={MOCK_CATEGORIES_FEW}
      initialMinPriority={80}
      initialMaxPriority={null}
      categoryCounts={MOCK_CATEGORY_COUNTS}
      bucketCounts={MOCK_BUCKET_COUNTS}
    />
  ),
};

export const LoadingStates: StoryObj = {
  name: 'Loading states',
  render: () => (
    <InboxFiltersDemo
      connectedAccounts={[]}
      availableCategories={[]}
      loadingAccounts
      loadingCategories
      initialMinPriority={null}
      initialMaxPriority={null}
    />
  ),
};

// ── PR #1486 — Mobile responsive layout stories ───────────────────────────────

/**
 * VisualCategoryFilter in compact mode (mobile).
 * Pills use reduced padding + font size while keeping ≥44px touch targets.
 * Labels truncate at 120px with ellipsis; full name on title attr.
 * Added in PR #1486 (fix #1477).
 */
export const CategoryCompactMobile: StoryObj = {
  name: 'Category — compact/mobile (≥44px touch targets, tight pills) [PR #1486]',
  render: () => (
    <I18nextProvider i18n={inboxFiltersI18n}>
      <div style={{ padding: '16px', maxWidth: '375px', border: '1px dashed #ccc' }}>
        <p style={{ marginBottom: '8px', fontSize: '11px', color: '#999' }}>
          Simulating 375px mobile viewport — compact=true
        </p>
        <VisualCategoryFilter
          categories={MOCK_CATEGORIES_MANY}
          selectedIds={['cat-uuid-1', 'cat-uuid-3']}
          onChange={() => {
            /* no-op */
          }}
          categoryCounts={MOCK_CATEGORY_COUNTS}
          compact
        />
      </div>
    </I18nextProvider>
  ),
};

/**
 * VisualCategoryFilter in compact mode with overflow dropdown open.
 * Overflow pills also render with compact sizing and ≥44px touch targets.
 * Added in PR #1486 (fix #1477).
 */
export const CategoryCompactOverflow: StoryObj = {
  name: 'Category — compact overflow dropdown [PR #1486]',
  render: () => {
    const CompactOverflowDemo: React.FC = () => {
      const [selectedIds, setSelectedIds] = React.useState<string[]>(['cat-uuid-1', 'cat-uuid-6']);
      return (
        <I18nextProvider i18n={inboxFiltersI18n}>
          <div style={{ padding: '16px', maxWidth: '375px', border: '1px dashed #ccc' }}>
            <p style={{ marginBottom: '8px', fontSize: '11px', color: '#999' }}>
              compact=true — click &quot;+ 3 more&quot; for overflow
            </p>
            <VisualCategoryFilter
              categories={MOCK_CATEGORIES_MANY}
              selectedIds={selectedIds}
              onChange={setSelectedIds}
              categoryCounts={MOCK_CATEGORY_COUNTS}
              compact
            />
            <p style={{ marginTop: '8px', fontSize: '11px', color: '#666' }}>selected: [{selectedIds.join(', ')}]</p>
          </div>
        </I18nextProvider>
      );
    };
    return <CompactOverflowDemo />;
  },
};

/**
 * InboxFilters rendered at 375px mobile width.
 * Category filter + priority slider stack vertically (flexDirection: column).
 * Each child is full-width; VisualCategoryFilter gets compact=true.
 * Added in PR #1486 (fix #1477).
 */
export const MobileStackedLayout: StoryObj = {
  name: 'InboxFilters — mobile 375px stacked layout [PR #1486]',
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
  },
  render: () => {
    const MobileDemo: React.FC = () => {
      const [filters, setFilters] = React.useState({
        accountIds: [] as string[],
        categories: ['cat-uuid-2'] as string[],
        minPriority: 80 as number | null,
        maxPriority: null as number | null,
      });
      const hasActiveFilters = filters.categories.length > 0 || filters.minPriority !== null;
      return (
        <I18nextProvider i18n={inboxFiltersI18n}>
          {/* Constrain to 375px to force the isMobile responsive path */}
          <div style={{ width: '375px', border: '1px dashed #aaa' }}>
            <InboxFilters
              isFilterBarVisible
              filters={filters}
              connectedAccounts={[MOCK_ACCOUNTS[0]]}
              availableCategories={MOCK_CATEGORIES_MANY}
              loadingAccounts={false}
              loadingCategories={false}
              hasActiveFilters={hasActiveFilters}
              setAccountFilter={ids => setFilters(prev => ({ ...prev, accountIds: ids }))}
              setCategoryFilter={cats => setFilters(prev => ({ ...prev, categories: cats }))}
              setPriorityFilter={(min, max = null) =>
                setFilters(prev => ({ ...prev, minPriority: min, maxPriority: max }))
              }
              onFilterChange={() => {
                /* no-op */
              }}
              categoryCounts={MOCK_CATEGORY_COUNTS}
              bucketCounts={MOCK_BUCKET_COUNTS}
              priorityTotalCount={Object.values(MOCK_BUCKET_COUNTS).reduce((acc, val) => acc + val, 0)}
            />
          </div>
          <p style={{ marginTop: '8px', fontSize: '11px', color: '#666' }}>
            On screens &lt;640px, InboxFilters stacks the category + priority rows and passes compact=true to
            VisualCategoryFilter. useResponsiveBreakpoints drives this.
          </p>
        </I18nextProvider>
      );
    };
    return <MobileDemo />;
  },
};

/**
 * InboxFilters at tablet width (768px): side-by-side layout preserved.
 * Category filter and priority slider are in a horizontal row (flexDirection: row).
 * compact=false so pills use full desktop sizing.
 * Added in PR #1486 (fix #1477).
 */
export const TabletSideBySideLayout: StoryObj = {
  name: 'InboxFilters — tablet 768px side-by-side layout [PR #1486]',
  parameters: {
    viewport: { defaultViewport: 'tablet' },
  },
  render: () => (
    <I18nextProvider i18n={inboxFiltersI18n}>
      <div style={{ width: '768px', border: '1px dashed #aaa' }}>
        <InboxFilters
          isFilterBarVisible
          filters={{
            accountIds: [],
            categories: ['cat-uuid-1'],
            minPriority: 40,
            maxPriority: null,
          }}
          connectedAccounts={[MOCK_ACCOUNTS[0]]}
          availableCategories={MOCK_CATEGORIES_MANY}
          loadingAccounts={false}
          loadingCategories={false}
          hasActiveFilters
          setAccountFilter={() => {
            /* no-op */
          }}
          setCategoryFilter={() => {
            /* no-op */
          }}
          setPriorityFilter={() => {
            /* no-op */
          }}
          onFilterChange={() => {
            /* no-op */
          }}
          categoryCounts={MOCK_CATEGORY_COUNTS}
          bucketCounts={MOCK_BUCKET_COUNTS}
          priorityTotalCount={Object.values(MOCK_BUCKET_COUNTS).reduce((acc, val) => acc + val, 0)}
        />
      </div>
      <p style={{ marginTop: '8px', fontSize: '11px', color: '#666' }}>
        At ≥640px (tablet/desktop), category + priority remain side-by-side (flex row, compact=false).
      </p>
    </I18nextProvider>
  ),
};
