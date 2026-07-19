import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { COLOR_TRANSPARENT } from 'constants/colors';
import type { ConnectedAccount, InboxFilter } from 'hooks/useInboxFilters';
import { useResponsiveBreakpoints } from 'hooks/useResponsiveBreakpoints';

import { getMultiSelectDisplayText } from './inboxFilters.helpers';
import { PriorityRangeSelector } from './PriorityRangeSelector';
import { VisualCategoryFilter } from './VisualCategoryFilter';

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
  setPriorityFilter: (minPriority: number | null, maxPriority?: number | null) => void;
  /** Optional per-category email counts, keyed by category id. */
  categoryCounts?: Record<string, number>;
  /** Optional per-bucket email counts for display under priority labels. */
  bucketCounts?: Record<string, number>;
  /** Optional total email count for the currently selected priority range. */
  priorityTotalCount?: number;
  /**
   * True while the inbox summary is being re-fetched (e.g. after a filter change).
   * Passed to VisualCategoryFilter so it can show a loading skeleton on pill counts
   * instead of stale values during cross-filter transitions. Fix #1466 (P2).
   */
  isSummaryLoading?: boolean;
}

// ── Multi-select dropdown (for Account filter) ────────────────────────────────

interface MultiSelectDropdownProps {
  label: string;
  options: Array<{ id: string; label: string }>;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
  searchable?: boolean;
  emptyMessage?: string;
}

interface MultiSelectDropdownPanelProps {
  searchable: boolean;
  searchTerm: string;
  setSearchTerm: (v: string) => void;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  filteredOptions: Array<{ id: string; label: string }>;
  selectedIds: string[];
  handleToggle: (id: string) => void;
  emptyMessage: string;
}

interface MultiSelectOptionItemProps {
  option: { id: string; label: string };
  isSelected: boolean;
  onToggle: (id: string) => void;
}

const MultiSelectOptionItem: React.FC<MultiSelectOptionItemProps> = ({ option, isSelected, onToggle }) => (
  <label
    style={{
      display: 'flex',
      alignItems: 'center',
      padding: `${theme.spacing.sm} ${theme.spacing.md}`,
      cursor: 'pointer',
      backgroundColor: isSelected ? theme.colors.background.subtle : 'transparent',
      transition: theme.transitions.fast,
    }}
    onMouseEnter={event => {
      if (!isSelected) {
        event.currentTarget.style.backgroundColor = theme.colors.background.subtle;
      }
    }}
    onMouseLeave={event => {
      if (!isSelected) {
        event.currentTarget.style.backgroundColor = COLOR_TRANSPARENT;
      }
    }}
  >
    <input
      type="checkbox"
      checked={isSelected}
      onChange={() => onToggle(option.id)}
      style={{
        marginRight: theme.spacing.sm,
        cursor: 'pointer',
        width: '16px',
        height: '16px',
        accentColor: theme.colors.primary.main,
      }}
    />
    <span style={{ fontSize: theme.typography.fontSize.lg, color: theme.colors.text.primary }}>{option.label}</span>
  </label>
);

const MultiSelectDropdownPanel: React.FC<MultiSelectDropdownPanelProps> = ({
  searchable,
  searchTerm,
  setSearchTerm,
  searchInputRef,
  filteredOptions,
  selectedIds,
  handleToggle,
  emptyMessage,
}) => {
  const { t } = useTranslation();
  return (
  <div
    style={{
      position: 'absolute',
      top: '100%',
      left: 0,
      right: 0,
      marginTop: theme.spacing.xs,
      maxHeight: '280px',
      backgroundColor: theme.colors.background.paper,
      border: `1px solid ${theme.colors.border.medium}`,
      borderRadius: theme.borderRadius.md,
      boxShadow: theme.shadows.lg,
      zIndex: 1000,
      display: 'flex',
      flexDirection: 'column',
    }}
  >
    {searchable && (
      <div style={{ padding: theme.spacing.sm, borderBottom: `1px solid ${theme.colors.border.light}` }}>
        <input
          ref={searchInputRef}
          type="text"
          value={searchTerm}
          onChange={event => setSearchTerm(event.target.value)}
          placeholder={t('inbox.filters.searchPlaceholder')}
          style={{
            width: '100%',
            padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
            fontSize: theme.typography.fontSize.lg,
            borderRadius: theme.borderRadius.sm,
            border: `1px solid ${theme.colors.border.light}`,
            backgroundColor: theme.colors.background.default,
            color: theme.colors.text.primary,
            outline: 'none',
          }}
        />
      </div>
    )}
    <div style={{ overflowY: 'auto', maxHeight: '220px' }}>
      {filteredOptions.length === 0 ? (
        <div
          style={{
            padding: theme.spacing.md,
            fontSize: theme.typography.fontSize.lg,
            color: theme.colors.text.tertiary,
            textAlign: 'center',
          }}
        >
          {emptyMessage}
        </div>
      ) : (
        filteredOptions.map(option => (
          <MultiSelectOptionItem
            key={option.id}
            option={option}
            isSelected={selectedIds.includes(option.id)}
            onToggle={handleToggle}
          />
        ))
      )}
    </div>
  </div>
  );
};

interface MultiSelectTriggerButtonProps {
  label: string;
  displayText: string;
  selectedCount: number;
  isOpen: boolean;
  onToggle: () => void;
}

const MultiSelectTriggerButton: React.FC<MultiSelectTriggerButtonProps> = ({
  label,
  displayText,
  selectedCount,
  isOpen,
  onToggle,
}) => (
  <>
    <label
      style={{
        display: 'block',
        marginBottom: theme.spacing.xs,
        fontSize: theme.typography.fontSize.lg,
        color: theme.colors.text.secondary,
        fontWeight: theme.typography.fontWeight.medium,
      }}
    >
      {label}
    </label>
    <button
      type="button"
      onClick={onToggle}
      style={{
        width: '100%',
        padding: `${theme.spacing.sm} ${theme.spacing.md}`,
        fontSize: theme.typography.fontSize.lg,
        borderRadius: theme.borderRadius.md,
        border: `1px solid ${theme.colors.border.medium}`,
        backgroundColor: theme.colors.background.paper,
        color: selectedCount > 0 ? theme.colors.text.primary : theme.colors.text.tertiary,
        cursor: 'pointer',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        transition: theme.transitions.fast,
        textAlign: 'left',
      }}
    >
      <span>{displayText}</span>
      <span style={{ color: theme.colors.text.tertiary }}>{isOpen ? '▲' : '▼'}</span>
    </button>
  </>
);

const MultiSelectDropdown: React.FC<MultiSelectDropdownProps> = ({
  label,
  options,
  selectedIds,
  onChange,
  placeholder = 'Select...',
  searchable = false,
  emptyMessage = 'No options available',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const filteredOptions = searchable
    ? options.filter(opt => opt.label.toLowerCase().includes(searchTerm.toLowerCase()))
    : options;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && searchable && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen, searchable]);

  const handleToggle = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter(selectedId => selectedId !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  const displayText = getMultiSelectDisplayText(selectedIds, options, placeholder);

  return (
    <div ref={dropdownRef} style={{ position: 'relative', minWidth: '200px', flex: '1' }}>
      <MultiSelectTriggerButton
        label={label}
        displayText={displayText}
        selectedCount={selectedIds.length}
        isOpen={isOpen}
        onToggle={() => setIsOpen(!isOpen)}
      />
      {isOpen && (
        <MultiSelectDropdownPanel
          searchable={searchable}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          searchInputRef={searchInputRef}
          filteredOptions={filteredOptions}
          selectedIds={selectedIds}
          handleToggle={handleToggle}
          emptyMessage={emptyMessage}
        />
      )}
    </div>
  );
};

// ── Main InboxFilters component ───────────────────────────────────────────────

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
  setPriorityFilter,
  categoryCounts,
  bucketCounts,
  priorityTotalCount,
  isSummaryLoading,
}) => {
  const { t } = useTranslation();
  const { isMobile } = useResponsiveBreakpoints();

  const handleAccountChange = (ids: string[]) => {
    setAccountFilter(ids);
    onFilterChange?.({ accountIds: ids });
  };

  const handleCategoryChange = (ids: string[]) => {
    setCategoryFilter(ids);
    onFilterChange?.({ categories: ids });
  };

  // Pass new priority values directly to bypass the stale-closure problem:
  // setPriorityFilter schedules an async React state update, but onFilterChange fires
  // synchronously in the same tick. Without the override, fetchEmails would read the
  // previous render's filters (stale closure) and send the old minPriority to the API.
  // Fixes: #1165 (selecting "High (30-50)" sends minPriority=0 from stale "Low" selection).
  const handlePriorityChange = (min: number | null, max: number | null) => {
    setPriorityFilter(min, max);
    onFilterChange?.({ minPriority: min, maxPriority: max });
  };

  const accountOptions = connectedAccounts.map(account => ({
    id: account.id,
    label: `${account.email} (${account.provider})`,
  }));

  // Hide account filter if only one account
  const showAccountFilter = connectedAccounts.length > 1;

  if (!isFilterBarVisible) {
    return null;
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: theme.spacing.sm,
        padding: theme.spacing.md,
        backgroundColor: theme.colors.background.paper,
        borderBottom: `1px solid ${theme.colors.border.light}`,
      }}
    >
      {/* Row 1: Account selector — full width, only shown if more than 1 connected account */}
      {showAccountFilter && !loadingAccounts && (
        <div style={{ width: '100%' }}>
          <MultiSelectDropdown
            label={t('inbox.filters.account')}
            options={accountOptions}
            selectedIds={filters.accountIds}
            onChange={handleAccountChange}
            placeholder={t('inbox.filters.allAccounts')}
            emptyMessage={t('inbox.filters.noAccounts')}
          />
        </div>
      )}

      {/* Row 2: Category filter + Priority range slider — stacked on mobile, side-by-side on tablet/desktop */}
      <div
        style={{
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          gap: theme.spacing.md,
          // Fix #1571 Bug 2: stretch makes both cards equal height on desktop/tablet;
          // keep flex-start on mobile (stacked) so cards don't stretch vertically.
          alignItems: isMobile ? 'flex-start' : 'stretch',
        }}
      >
        {/* Category Filter — visual pill-based multi-select.
            Fix #1526 bug 5: always render VisualCategoryFilter; pass loading=true while
            categories are fetching so the component can show skeleton pills instead of
            flashing in fully-formed all at once. This avoids the brief blank gap when the
            filter bar first opens and fetchCategories is in-flight.
            display:flex+flexDirection:column lets the inner component's flex:1 fill the
            wrapper height so both cards stretch to the same height (fix #1735). */}
        <div style={{ flex: 1, minWidth: 0, width: isMobile ? '100%' : undefined, display: 'flex', flexDirection: 'column' }}>
          <VisualCategoryFilter
            categories={loadingCategories ? [] : availableCategories}
            selectedIds={filters.categories}
            onChange={handleCategoryChange}
            categoryCounts={categoryCounts}
            loading={loadingCategories || isSummaryLoading}
            compact={isMobile}
          />
        </div>

        {/* Priority Filter — dual-thumb range slider.
            display:flex+flexDirection:column lets PriorityRangeSelector's flex:1 fill
            the wrapper so it matches the Category card height (fix #1735). */}
        <div style={{ flex: 1, minWidth: 0, width: isMobile ? '100%' : undefined, display: 'flex', flexDirection: 'column' }}>
          <PriorityRangeSelector
            selectedMin={filters.minPriority}
            selectedMax={filters.maxPriority}
            onChange={handlePriorityChange}
            bucketCounts={bucketCounts}
            totalCount={priorityTotalCount}
          />
        </div>
      </div>
    </div>
  );
};
