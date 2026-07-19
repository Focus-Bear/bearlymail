/**
 * VisualCategoryFilter — pill-based multi-select category filter.
 *
 * Design: Simple selected/unselected pill buttons for each category.
 * Selected pills have a filled background + tick (✓) icon.
 * Unselected pills are plain/outlined.
 * "All" pill to clear selection.
 * First 5 categories shown directly; remainder hidden behind a "+ N more" overflow dropdown.
 *
 * Each pill shows the email count next to the category name: `Newsletters (12)`.
 *
 * Implemented for issue #1414 (visual filters).
 * UX improvements in PR #1417: counts per pill, cleaner selected state with tick icon.
 *
 * UI-only component — no state management, localStorage, or API concerns.
 * Wires to `categories` in `useInboxFilters`.
 */
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { COLOR_TRANSPARENT } from 'constants/colors';

/** How many category pills to show before overflow. */
const MAX_VISIBLE_PILLS = 5;

// ── Sub-components ────────────────────────────────────────────────────────────

/** Max width for pill labels before truncating. Tighter on mobile (compact). */
const PILL_LABEL_MAX_WIDTH_DEFAULT = 200;
const PILL_LABEL_MAX_WIDTH_COMPACT = 120;

interface PillProps {
  label: string;
  isSelected: boolean;
  count?: number;
  isAll?: boolean;
  compact?: boolean;
  onClick: () => void;
}

// eslint-disable-next-line complexity -- pre-existing: complex render with many conditional branches
const CategoryPill: React.FC<PillProps> = ({ label, isSelected, count, isAll = false, compact = false, onClick }) => {
  const { t } = useTranslation();
  let backgroundColor: string;
  if (isSelected && isAll) {
    backgroundColor = theme.colors.secondary.main;
  } else if (isSelected) {
    backgroundColor = theme.colors.background.subtle;
  } else {
    backgroundColor = theme.colors.background.paper;
  }

  let borderColor: string;
  if (isSelected && isAll) {
    borderColor = theme.colors.secondary.main;
  } else if (isSelected) {
    borderColor = theme.colors.primary.main;
  } else {
    borderColor = theme.colors.border.medium;
  }

  let textColor: string;
  if (isSelected && isAll) {
    // Fix #1526 bug 1: use theme token instead of hardcoded '#FFFFFF'
    textColor = theme.colors.text.inverse;
  } else if (isSelected) {
    textColor = theme.colors.text.primary;
  } else {
    textColor = theme.colors.text.secondary;
  }

  const maxLabelWidth = compact ? PILL_LABEL_MAX_WIDTH_COMPACT : PILL_LABEL_MAX_WIDTH_DEFAULT;
  const countSuffix = count !== undefined ? ` (${count})` : '';

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isSelected}
      title={`${label}${countSuffix}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        padding: compact ? `${theme.spacing.xs} ${theme.spacing.xs}` : `${theme.spacing.xs} ${theme.spacing.sm}`,
        fontSize: compact ? theme.typography.fontSize.md : theme.typography.fontSize.lg,
        fontWeight: isSelected ? theme.typography.fontWeight.semibold : theme.typography.fontWeight.medium,
        backgroundColor,
        color: textColor,
        border: `1.5px solid ${borderColor}`,
        borderRadius: theme.borderRadius.full,
        cursor: 'pointer',
        transition: theme.transitions.fast,
        outline: 'none',
        boxShadow: isSelected && !isAll ? `0 0 0 2px ${theme.colors.primary.main}33` : 'none',
        minHeight: '44px',
        minWidth: compact ? '44px' : undefined,
      }}
      onFocus={event => {
        event.currentTarget.style.boxShadow = `0 0 0 3px ${theme.colors.primary.main}44`;
      }}
      onBlur={event => {
        event.currentTarget.style.boxShadow =
          isSelected && !isAll ? `0 0 0 2px ${theme.colors.primary.main}33` : 'none';
      }}
    >
      {isSelected && !isAll && (
        <span
          aria-hidden="true"
          style={{
            fontSize: '11px',
            fontWeight: 'bold',
            color: theme.colors.primary.main,
            lineHeight: 1,
            flexShrink: 0,
          }}
        >
          {t('common.checkmark')}
        </span>
      )}
      <span
        style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          maxWidth: `${maxLabelWidth}px`,
        }}
      >
        {label}
      </span>
      {countSuffix && <span style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>{countSuffix}</span>}
    </button>
  );
};

interface OverflowDropdownProps {
  categories: Array<{ id: string; label: string }>;
  startIndex: number;
  selectedIds: string[];
  categoryCounts?: Record<string, number>;
  onToggle: (id: string) => void;
  overflowCount: number;
  compact?: boolean;
}

const OverflowDropdown: React.FC<OverflowDropdownProps> = ({
  categories,
  selectedIds,
  categoryCounts,
  onToggle,
  overflowCount,
  compact = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  /**
   * Fix #1526 bug 2: detect if the dropdown panel would overflow the right edge of the viewport.
   * When it would, align the panel to the right of the trigger instead of the left.
   */
  const [alignRight, setAlignRight] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();

  const hasSelectedOverflow = categories.some(cat => selectedIds.includes(cat.id));

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fix #1526 bug 2: after the panel mounts, check if it overflows the viewport right edge.
  useLayoutEffect(() => {
    if (isOpen && panelRef.current) {
      const rect = panelRef.current.getBoundingClientRect();
      setAlignRight(rect.right > window.innerWidth);
    } else if (!isOpen) {
      setAlignRight(false);
    }
  }, [isOpen]);

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={t('inbox.filters.showMoreCategories', `Show ${overflowCount} more categories`)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          padding: compact ? `${theme.spacing.xs} ${theme.spacing.xs}` : `${theme.spacing.xs} ${theme.spacing.sm}`,
          fontSize: compact ? theme.typography.fontSize.md : theme.typography.fontSize.lg,
          fontWeight: theme.typography.fontWeight.medium,
          backgroundColor: hasSelectedOverflow ? theme.colors.background.subtle : theme.colors.background.paper,
          color: hasSelectedOverflow ? theme.colors.text.primary : theme.colors.text.tertiary,
          border: `1.5px solid ${hasSelectedOverflow ? theme.colors.primary.main : theme.colors.border.medium}`,
          borderRadius: theme.borderRadius.full,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          transition: theme.transitions.fast,
          outline: 'none',
          minHeight: compact ? '44px' : undefined,
          minWidth: compact ? '44px' : undefined,
        }}
      >
        +{overflowCount} {t('inbox.filters.moreCategories', 'more')}
        <span aria-hidden="true" style={{ fontSize: '10px' }}>
          {isOpen ? '▲' : '▼'}
        </span>
      </button>

      {isOpen && (
        <div
          ref={panelRef}
          role="listbox"
          aria-multiselectable="true"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            // Fix #1526 bug 2: when the panel would overflow the right viewport edge,
            // anchor to the right of the trigger instead of the left.
            left: alignRight ? undefined : 0,
            right: alignRight ? 0 : undefined,
            minWidth: '200px',
            backgroundColor: theme.colors.background.paper,
            border: `1px solid ${theme.colors.border.medium}`,
            borderRadius: theme.borderRadius.md,
            boxShadow: theme.shadows.lg,
            zIndex: 1000,
            padding: `${theme.spacing.xs} 0`,
          }}
        >
          {categories.map(cat => {
            const isSelected = selectedIds.includes(cat.id);
            const count = categoryCounts?.[cat.id];
            const displayLabel = count !== undefined ? `${cat.label} (${count})` : cat.label;
            return (
              <button
                key={cat.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                title={displayLabel}
                onClick={() => onToggle(cat.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: theme.spacing.sm,
                  width: '100%',
                  padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                  fontSize: theme.typography.fontSize.lg,
                  color: theme.colors.text.primary,
                  backgroundColor: isSelected ? theme.colors.background.subtle : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: theme.transitions.fast,
                  outline: 'none',
                  fontWeight: isSelected ? theme.typography.fontWeight.semibold : theme.typography.fontWeight.medium,
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
                <span style={{ flex: 1 }}>{displayLabel}</span>
                {isSelected && (
                  <span
                    aria-hidden="true"
                    style={{
                      fontSize: '12px',
                      fontWeight: 'bold',
                      color: theme.colors.primary.main,
                    }}
                  >
                    {t('common.checkmark')}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ── Main component ────────────────────────────────────────────────────────────

export interface VisualCategoryFilterProps {
  /** All available categories with id + label. */
  categories: Array<{ id: string; label: string }>;
  /** Currently selected category ids. */
  selectedIds: string[];
  /**
   * Called when the selection changes.
   * Empty array = "All" (no category filter).
   */
  onChange: (ids: string[]) => void;
  /** Optional total email count shown next to the header. */
  totalCount?: number;
  /**
   * Optional per-category email counts, keyed by category id.
   * When provided, each pill shows the count: `Newsletters (12)`.
   */
  categoryCounts?: Record<string, number>;
  /**
   * When true, pill counts show a loading skeleton instead of (possibly stale)
   * count values. Used during inbox summary refetch after a filter change.
   * Fix #1466 (P2): prevents stale count flash during cross-filter transitions.
   */
  loading?: boolean;
  /**
   * When true, renders pills with reduced padding and font size for narrow/mobile viewports.
   * Touch targets are preserved at ≥44px.
   */
  compact?: boolean;
}

export const VisualCategoryFilter: React.FC<VisualCategoryFilterProps> = ({
  categories,
  selectedIds,
  onChange,
  totalCount,
  categoryCounts,
  loading,
  compact = false,
}) => {
  const { t } = useTranslation();

  const visibleCategories = categories.slice(0, MAX_VISIBLE_PILLS);
  const overflowCategories = categories.slice(MAX_VISIBLE_PILLS);
  const isAllSelected = selectedIds.length === 0;

  /**
   * Fix #1526 bug 5: when categories haven't loaded yet (loading=true, categories=[]),
   * show skeleton placeholder pills so the filter bar appears immediately without a blank
   * gap, and without flashing in count-less pills after the fetch completes.
   */
  const SKELETON_PILL_COUNT = 4;
  const showSkeleton = loading && categories.length === 0;

  const handleAllClick = useCallback(() => {
    onChange([]);
  }, [onChange]);

  const handleToggle = useCallback(
    (id: string) => {
      if (selectedIds.includes(id)) {
        onChange(selectedIds.filter(sid => sid !== id));
      } else {
        onChange([...selectedIds, id]);
      }
    },
    [selectedIds, onChange]
  );

  // Summary text for header
  const selectedLabels = selectedIds.map(id => categories.find(cat => cat.id === id)?.label).filter(Boolean);
  let summaryText: string;
  if (isAllSelected) {
    summaryText = t('inbox.filters.allCategories', 'All categories');
  } else if (selectedLabels.length === 1) {
    summaryText = selectedLabels[0]!;
  } else {
    summaryText = t('inbox.filters.nCategoriesSelected', '{{count}} selected', { count: selectedLabels.length });
  }

  // While summary is refetching, show a neutral "…" instead of a stale count (fix #1466).
  let countText: string;
  if (loading) {
    countText = ' (…)';
  } else if (totalCount !== undefined) {
    countText = ` (${totalCount})`;
  } else {
    countText = '';
  }

  return (
    <div
      style={{
        flex: '1',
        minWidth: '0',
        // Fix #1571 Bug 2: flex column layout so this card fills its parent height when
        // InboxFilters uses alignItems: 'stretch' for equal-height side-by-side cards.
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: theme.colors.background.paper,
        border: `1px solid ${theme.colors.border.light}`,
        borderRadius: theme.borderRadius.md,
        padding: theme.spacing.md,
        boxShadow: theme.shadows.sm,
        overflow: 'visible',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: theme.spacing.sm,
        }}
      >
        <span
          style={{
            fontSize: theme.typography.fontSize.lg,
            fontWeight: theme.typography.fontWeight.semibold,
            color: theme.colors.text.primary,
          }}
        >
          {t('inbox.filters.category', 'Category')}
        </span>
        <span
          style={{
            fontSize: theme.typography.fontSize.lg,
            color: theme.colors.text.tertiary,
          }}
        >
          {summaryText}
          {countText}
        </span>
      </div>

      {/* Pills */}
      <div
        role="group"
        aria-label={t('inbox.filters.categoryGroup', 'Category filter')}
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: theme.spacing.xs,
          alignItems: 'center',
          overflow: 'visible',
        }}
      >
        {/* "All" pill */}
        <CategoryPill
          label={t('inbox.filters.allCategories', 'All')}
          isSelected={isAllSelected}
          isAll
          compact={compact}
          onClick={handleAllClick}
        />

        {/* Fix #1526 bug 5: skeleton placeholder pills while categories load */}
        {showSkeleton &&
          ['a', 'b', 'c', 'd'].map(id => (
            <div
              key={`skeleton-pill-${id}`}
              aria-hidden="true"
              style={{
                display: 'inline-flex',
                width: compact ? '60px' : '80px',
                height: compact ? '44px' : '32px',
                borderRadius: theme.borderRadius.full,
                backgroundColor: theme.colors.background.subtle,
                border: `1.5px solid ${theme.colors.border.light}`,
                animation: 'bearlymail-skeleton-pulse 1.2s ease-in-out infinite',
                opacity: 0.7,
              }}
            />
          ))}

        {/* Visible category pills — suppress counts while summary is refetching (fix #1466) */}
        {visibleCategories.map(cat => (
          <CategoryPill
            key={cat.id}
            label={cat.label}
            isSelected={selectedIds.includes(cat.id)}
            count={loading ? undefined : categoryCounts?.[cat.id]}
            compact={compact}
            onClick={() => handleToggle(cat.id)}
          />
        ))}

        {/* Overflow dropdown — suppress counts while summary is refetching (fix #1466) */}
        {overflowCategories.length > 0 && (
          <OverflowDropdown
            categories={overflowCategories}
            startIndex={MAX_VISIBLE_PILLS}
            selectedIds={selectedIds}
            categoryCounts={loading ? undefined : categoryCounts}
            onToggle={handleToggle}
            overflowCount={overflowCategories.length}
            compact={compact}
          />
        )}
      </div>
    </div>
  );
};
