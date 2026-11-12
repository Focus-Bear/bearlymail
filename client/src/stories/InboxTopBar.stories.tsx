/**
 * The inbox top bar as a phone user sees it: the header (tabs, filter toggle, Clear, actions)
 * with the filter panel open underneath. View it at 360px / 390px to check nothing is clipped,
 * and at desktop width to check the wide layout.
 */
import React, { useRef, useState } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import type { Meta, StoryObj } from '@storybook/react';
import i18n from 'i18next';
import { InboxMode } from 'types/email';

import { InboxFilters } from 'components/inbox/InboxFilters';
import { InboxHeader } from 'components/inbox/InboxHeader';
import type { InboxFilter } from 'hooks/useInboxFilters';
import en from 'locales/en.json';

const storyI18n = i18n.createInstance();
storyI18n.use(initReactI18next).init({
  lng: 'en',
  resources: { en: { translation: en } },
  interpolation: { escapeValue: false },
});

/** Cancels the global Storybook wrapper's padding so the bar spans the viewport like the app. */
const STORYBOOK_WRAPPER_PADDING = '-24px';

const TAB_COUNTS = { triage: 0, action: 5, followUp: 0 };

const BUCKET_COUNTS: Record<string, number> = {
  'Very High': 0,
  High: 0,
  Medium: 0,
  Low: 2,
  'Very Low': 3,
};

const CATEGORIES = [
  { id: 'cat-1', label: 'Newsletters' },
  { id: 'cat-2', label: 'Receipts' },
  { id: 'cat-3', label: 'Clients' },
];

const CATEGORY_COUNTS: Record<string, number> = { 'cat-1': 12, 'cat-2': 5, 'cat-3': 3 };

/** Very High + High ticked: the new-user guided default. */
const HIGH_AND_ABOVE_FILTER: InboxFilter = { accountIds: [], categories: [], minPriority: 30, maxPriority: null };

interface InboxTopBarDemoProps {
  availableCategories: Array<{ id: string; label: string }>;
  categoryCounts?: Record<string, number>;
}

const InboxTopBarDemo: React.FC<InboxTopBarDemoProps> = ({ availableCategories, categoryCounts }) => {
  const [mode, setMode] = useState<InboxMode>('triage');
  const [filters, setFilters] = useState<InboxFilter>(HIGH_AND_ABOVE_FILTER);
  const [isFilterBarVisible, setIsFilterBarVisible] = useState(true);
  const triageTabRef = useRef<HTMLButtonElement>(null);
  const actionTabRef = useRef<HTMLButtonElement>(null);
  const followUpTabRef = useRef<HTMLButtonElement>(null);

  const activeFilterCount =
    (filters.categories.length > 0 ? 1 : 0) + (filters.minPriority !== null || filters.maxPriority !== null ? 1 : 0);
  const hasActiveFilters = activeFilterCount > 0;
  const clearFilters = () => setFilters({ accountIds: [], categories: [], minPriority: null, maxPriority: null });

  return (
    <I18nextProvider i18n={storyI18n}>
      <MemoryRouter>
        <div style={{ margin: STORYBOOK_WRAPPER_PADDING }}>
          <InboxHeader
            mode={mode}
            setMode={setMode}
            loadingModeSwitch={false}
            triageTabRef={triageTabRef}
            actionTabRef={actionTabRef}
            followUpTabRef={followUpTabRef}
            tabCounts={TAB_COUNTS}
            onToggleMobileMenu={() => {
              /* no-op in Storybook */
            }}
            isFilterBarVisible={isFilterBarVisible}
            hasActiveFilters={hasActiveFilters}
            activeFilterCount={activeFilterCount}
            onToggleFilterBar={() => setIsFilterBarVisible(visible => !visible)}
            onClearFilters={clearFilters}
            isAdmin
            onToggleDebug={() => {
              /* no-op in Storybook */
            }}
          />
          <InboxFilters
            isFilterBarVisible={isFilterBarVisible}
            filters={filters}
            connectedAccounts={[]}
            availableCategories={availableCategories}
            loadingAccounts={false}
            loadingCategories={false}
            hasActiveFilters={hasActiveFilters}
            setAccountFilter={ids => setFilters(prev => ({ ...prev, accountIds: ids }))}
            setCategoryFilter={categories => setFilters(prev => ({ ...prev, categories }))}
            onPriorityChange={(minPriority, maxPriority) => setFilters(prev => ({ ...prev, minPriority, maxPriority }))}
            onCollapse={() => setIsFilterBarVisible(false)}
            categoryCounts={categoryCounts}
            bucketCounts={BUCKET_COUNTS}
            priorityTotalCount={0}
          />
        </div>
      </MemoryRouter>
    </I18nextProvider>
  );
};

const meta: Meta<typeof InboxTopBarDemo> = {
  title: 'Inbox/InboxTopBar',
  component: InboxTopBarDemo,
  parameters: { layout: 'fullscreen' },
};
export default meta;

type Story = StoryObj<typeof InboxTopBarDemo>;

/** What the user reported: no categories yet, so the category filter has nothing but "All". */
export const NoCategories: Story = {
  args: { availableCategories: [] },
};

export const WithCategories: Story = {
  args: { availableCategories: CATEGORIES, categoryCounts: CATEGORY_COUNTS },
};
