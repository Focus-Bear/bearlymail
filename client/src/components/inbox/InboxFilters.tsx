import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { EMOJI_CLOSE } from 'constants/emojis';
import { PRIORITY_LABEL_TO_KEY } from 'constants/priorityBuckets';
import type { ConnectedAccount, InboxFilter } from 'hooks/useInboxFilters';
import { useResponsiveBreakpoints } from 'hooks/useResponsiveBreakpoints';

import { CategoryCheckboxList } from './CategoryCheckboxList';
import { FILTER_TOUCH_TARGET, FilterMenu } from './FilterMenu';
import { FilterMenuOption } from './FilterMenuOption';
import { getSelectionSummary } from './inboxFilters.helpers';
import {
  describePriorityRange,
  PRIORITY_RANGE_AND_ABOVE,
  PRIORITY_RANGE_BETWEEN,
  PRIORITY_RANGE_SINGLE,
} from './priorityCheckboxes.helpers';
import { PriorityCheckboxFilter } from './PriorityCheckboxFilter';

export const INBOX_FILTERS_COLLAPSE_TEST_ID = 'inbox-filters-collapse';
export const ACCOUNT_FILTER_MENU_TEST_ID = 'inbox-filter-account';
export const CATEGORY_FILTER_MENU_TEST_ID = 'inbox-filter-category';
export const PRIORITY_FILTER_MENU_TEST_ID = 'inbox-filter-priority';

interface InboxFiltersProps {
  onFilterChange?: (overrideFilters?: Partial<InboxFilter>) => void;
  isFilterBarVisible: boolean;
  filters: InboxFilter;
  connectedAccounts: ConnectedAccount[];
  availableCategories: Array<{ id: string; label: string }>;
  loadingAccounts: boolean;
  loadingCategories: boolean;
  hasActiveFilters: boolean;
  setAccountFilter: (accountIds: string[]) => void;
  setCategoryFilter: (categories: string[]) => void;
  /**
   * Applies a priority choice from the checkboxes. Owned by the inbox page so the choice goes
   * through the same distraction gate as every other way of revealing lower-priority mail.
   */
  onPriorityChange: (minPriority: number | null, maxPriority: number | null) => void;
  /** Collapses the filter panel (the ✕ button); the inbox remembers the choice. */
  onCollapse: () => void;
  /** Optional per-category email counts, keyed by category id. */
  categoryCounts?: Record<string, number>;
  /** Optional per-bucket email counts for display under priority labels. */
  bucketCounts?: Record<string, number>;
  /** Optional total email count for the currently selected priority range. */
  priorityTotalCount?: number;
  /**
   * True while the inbox summary is being re-fetched (e.g. after a filter change).
   * The category list holds its counts back meanwhile rather than showing stale
   * values during cross-filter transitions. Fix #1466 (P2).
   */
  isSummaryLoading?: boolean;
  /**
   * Whether the priority filter actually applies in the current mode. A GUIDED
   * (auto) priority filter is suppressed outside Triage, so the menu must read
   * "All" there — otherwise it names a "High" bucket that isn't filtering
   * and can't be cleared. Defaults to true when unspecified.
   */
  isPriorityFilterActive?: boolean;
}

/** The ✕ that hides the filter bar; the inbox remembers the choice. */
const CollapseButton: React.FC<{ onCollapse: () => void; touch: boolean }> = ({ onCollapse, touch }) => {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      data-testid={INBOX_FILTERS_COLLAPSE_TEST_ID}
      onClick={onCollapse}
      aria-label={t('inbox.filters.collapse')}
      title={t('inbox.filters.collapse')}
      style={{
        flexShrink: 0,
        minWidth: touch ? FILTER_TOUCH_TARGET : undefined,
        minHeight: touch ? FILTER_TOUCH_TARGET : undefined,
        marginLeft: touch ? undefined : 'auto',
        padding: theme.spacing.xs,
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        color: theme.colors.text.tertiary,
        fontSize: theme.typography.fontSize.md,
        lineHeight: 1,
      }}
    >
      {EMOJI_CLOSE}
    </button>
  );
};

/** The priority button's wording for a score range: "All", "High", "High and above", "Low to High". */
function usePrioritySummary(minPriority: number | null, maxPriority: number | null, short: boolean): string {
  const { t } = useTranslation();
  const bucketName = (label: string) => t(`inbox.filters.buckets.${PRIORITY_LABEL_TO_KEY[label]}`);
  const description = describePriorityRange({ minPriority, maxPriority });
  if (description.kind === PRIORITY_RANGE_SINGLE) {
    return bucketName(description.bucket);
  }
  if (description.kind === PRIORITY_RANGE_AND_ABOVE) {
    return t(short ? 'inbox.filters.priorityAndAboveShort' : 'inbox.filters.priorityAndAbove', {
      bucket: bucketName(description.bucket),
    });
  }
  if (description.kind === PRIORITY_RANGE_BETWEEN) {
    return t('inbox.filters.priorityBetween', {
      lowest: bucketName(description.lowest),
      highest: bucketName(description.highest),
    });
  }
  return t('inbox.filters.all');
}

interface AccountFilterMenuProps {
  accounts: ConnectedAccount[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  touch: boolean;
}

const AccountFilterMenu: React.FC<AccountFilterMenuProps> = ({ accounts, selectedIds, onChange, touch }) => {
  const { t } = useTranslation();
  const options = accounts.map(account => ({ id: account.id, label: `${account.email} (${account.provider})` }));
  const handleToggle = (id: string) => {
    onChange(selectedIds.includes(id) ? selectedIds.filter(selectedId => selectedId !== id) : [...selectedIds, id]);
  };
  return (
    <FilterMenu
      testId={ACCOUNT_FILTER_MENU_TEST_ID}
      label={t('inbox.filters.account')}
      summary={getSelectionSummary(selectedIds, options, t('inbox.filters.allAccounts'), count =>
        t('inbox.filters.nCategoriesSelected', { count })
      )}
      isFiltering={selectedIds.length > 0}
      hideLabel
      touch={touch}
    >
      {options.map(option => (
        <FilterMenuOption
          key={option.id}
          label={option.label}
          isChecked={selectedIds.includes(option.id)}
          touch={touch}
          onToggle={() => handleToggle(option.id)}
        />
      ))}
    </FilterMenu>
  );
};

function getBarStyle(isMobile: boolean): React.CSSProperties {
  return {
    // Anchors the menus on a phone, where they span the bar instead of hanging off a button.
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: isMobile ? `${theme.spacing.xs} ${theme.spacing.sm}` : `${theme.spacing.sm} ${theme.spacing.md}`,
    backgroundColor: theme.colors.background.paper,
    borderBottom: `1px solid ${theme.colors.border.light}`,
  };
}

/**
 * The inbox filter bar: one slim row of menu buttons (account, category, priority). Each button
 * states its current choice and opens a vertical checkbox list.
 */
export const InboxFilters: React.FC<InboxFiltersProps> = ({
  onFilterChange,
  isFilterBarVisible,
  filters,
  connectedAccounts,
  availableCategories,
  loadingAccounts,
  loadingCategories,
  setAccountFilter,
  setCategoryFilter,
  onPriorityChange,
  onCollapse,
  categoryCounts,
  bucketCounts,
  priorityTotalCount,
  isSummaryLoading,
  isPriorityFilterActive = true,
}) => {
  const { t } = useTranslation();
  const { isMobile } = useResponsiveBreakpoints();
  const minPriority = isPriorityFilterActive ? filters.minPriority : null;
  const maxPriority = isPriorityFilterActive ? filters.maxPriority : null;
  const prioritySummary = usePrioritySummary(minPriority, maxPriority, isMobile);

  if (!isFilterBarVisible) {
    return null;
  }

  const handleAccountChange = (ids: string[]) => {
    setAccountFilter(ids);
    onFilterChange?.({ accountIds: ids });
  };

  const handleCategoryChange = (ids: string[]) => {
    setCategoryFilter(ids);
    onFilterChange?.({ categories: ids });
  };

  // With a single account there is nothing to choose between.
  const showAccountFilter = connectedAccounts.length > 1 && !loadingAccounts;
  // On a phone a category button that opens onto nothing costs half the bar for no choice.
  const hasNoCategoryChoice =
    !loadingCategories && !isSummaryLoading && availableCategories.length === 0 && filters.categories.length === 0;
  const showCategoryFilter = !(isMobile && hasNoCategoryChoice);

  return (
    <div style={getBarStyle(isMobile)}>
      {showAccountFilter && (
        <AccountFilterMenu
          accounts={connectedAccounts}
          selectedIds={filters.accountIds}
          onChange={handleAccountChange}
          touch={isMobile}
        />
      )}

      {showCategoryFilter && (
        <FilterMenu
          testId={CATEGORY_FILTER_MENU_TEST_ID}
          label={t('inbox.filters.category')}
          summary={getSelectionSummary(
            filters.categories,
            availableCategories,
            t('inbox.filters.all'),
            count => t('inbox.filters.nCategoriesSelected', { count })
          )}
          isFiltering={filters.categories.length > 0}
          touch={isMobile}
        >
          <CategoryCheckboxList
            categories={loadingCategories ? [] : availableCategories}
            selectedIds={filters.categories}
            onChange={handleCategoryChange}
            categoryCounts={categoryCounts}
            loading={loadingCategories || isSummaryLoading}
            touch={isMobile}
          />
        </FilterMenu>
      )}

      <FilterMenu
        testId={PRIORITY_FILTER_MENU_TEST_ID}
        label={t('inbox.filters.priorityLabel')}
        summary={prioritySummary}
        isFiltering={minPriority !== null || maxPriority !== null}
        touch={isMobile}
      >
        <PriorityCheckboxFilter
          selectedMin={minPriority}
          selectedMax={maxPriority}
          onChange={onPriorityChange}
          bucketCounts={bucketCounts}
          totalCount={priorityTotalCount}
          touch={isMobile}
        />
      </FilterMenu>

      <CollapseButton onCollapse={onCollapse} touch={isMobile} />
    </div>
  );
};
