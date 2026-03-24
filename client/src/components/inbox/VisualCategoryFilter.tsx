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
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

/** How many category pills to show before overflow. */
const MAX_VISIBLE_PILLS = 5;

// ── Sub-components ────────────────────────────────────────────────────────────

interface PillProps {
  label: string;
  isSelected: boolean;
  count?: number;
  isAll?: boolean;
  onClick: () => void;
}

const CategoryPill: React.FC<PillProps> = ({ label, isSelected, count, isAll = false, onClick }) => {
  const { t } = useTranslation();
  const backgroundColor = isSelected
    ? isAll
      ? theme.colors.secondary.main
      : theme.colors.background.subtle
    : theme.colors.background.paper;

  const borderColor = isSelected
    ? isAll
      ? theme.colors.secondary.main
      : theme.colors.primary.main
    : theme.colors.border.medium;

  const textColor = isSelected
    ? isAll
      ? '#FFFFFF'
      : theme.colors.text.primary
    : theme.colors.text.secondary;

  const displayLabel = count !== undefined ? `${label} (${count})` : label;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isSelected}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
        fontSize: theme.typography.fontSize.lg,
        fontWeight: isSelected ? theme.typography.fontWeight.semibold : theme.typography.fontWeight.medium,
        backgroundColor,
        color: textColor,
        border: `1.5px solid ${borderColor}`,
        borderRadius: theme.borderRadius.full,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        transition: theme.transitions.fast,
        outline: 'none',
        boxShadow: isSelected && !isAll ? `0 0 0 2px ${theme.colors.primary.main}33` : 'none',
      }}
      onFocus={event => {
        event.currentTarget.style.boxShadow = `0 0 0 3px ${theme.colors.primary.main}44`;
      }}
      onBlur={event => {
        event.currentTarget.style.boxShadow = isSelected && !isAll ? `0 0 0 2px ${theme.colors.primary.main}33` : 'none';
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
      {displayLabel}
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
}

const OverflowDropdown: React.FC<OverflowDropdownProps> = ({
  categories,
  selectedIds,
  categoryCounts,
  onToggle,
  overflowCount,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
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
          padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
          fontSize: theme.typography.fontSize.lg,
          fontWeight: theme.typography.fontWeight.medium,
          backgroundColor: hasSelectedOverflow ? theme.colors.background.subtle : theme.colors.background.paper,
          color: hasSelectedOverflow ? theme.colors.text.primary : theme.colors.text.tertiary,
          border: `1.5px solid ${hasSelectedOverflow ? theme.colors.primary.main : theme.colors.border.medium}`,
          borderRadius: theme.borderRadius.full,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          transition: theme.transitions.fast,
          outline: 'none',
        }}
      >
        +{overflowCount} {t('inbox.filters.moreCategories', 'more')}
        <span aria-hidden="true" style={{ fontSize: '10px' }}>{isOpen ? '▲' : '▼'}</span>
      </button>

      {isOpen && (
        <div
          role="listbox"
          aria-multiselectable="true"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
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
                    event.currentTarget.style.backgroundColor = 'transparent';
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
}

export const VisualCategoryFilter: React.FC<VisualCategoryFilterProps> = ({
  categories,
  selectedIds,
  onChange,
  totalCount,
  categoryCounts,
}) => {
  const { t } = useTranslation();

  const visibleCategories = categories.slice(0, MAX_VISIBLE_PILLS);
  const overflowCategories = categories.slice(MAX_VISIBLE_PILLS);
  const isAllSelected = selectedIds.length === 0;

  const handleAllClick = useCallback(() => {
    onChange([]);
  }, [onChange]);

  const handleToggle = useCallback((id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter(sid => sid !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  }, [selectedIds, onChange]);

  // Summary text for header
  const selectedLabels = selectedIds
    .map(id => categories.find(cat => cat.id === id)?.label)
    .filter(Boolean);
  const summaryText = isAllSelected
    ? t('inbox.filters.allCategories', 'All categories')
    : selectedLabels.length === 1
      ? selectedLabels[0]!
      : t('inbox.filters.nCategoriesSelected', '{{count}} selected', { count: selectedLabels.length });

  const countText = totalCount !== undefined ? ` (${totalCount})` : '';

  return (
    <div
      style={{
        flex: '1',
        minWidth: '0',
        backgroundColor: theme.colors.background.paper,
        border: `1px solid ${theme.colors.border.light}`,
        borderRadius: theme.borderRadius.md,
        padding: theme.spacing.md,
        boxShadow: theme.shadows.sm,
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
          {summaryText}{countText}
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
        }}
      >
        {/* "All" pill */}
        <CategoryPill
          label={t('inbox.filters.allCategories', 'All')}
          isSelected={isAllSelected}
          isAll
          onClick={handleAllClick}
        />

        {/* Visible category pills */}
        {visibleCategories.map(cat => (
          <CategoryPill
            key={cat.id}
            label={cat.label}
            isSelected={selectedIds.includes(cat.id)}
            count={categoryCounts?.[cat.id]}
            onClick={() => handleToggle(cat.id)}
          />
        ))}

        {/* Overflow dropdown */}
        {overflowCategories.length > 0 && (
          <OverflowDropdown
            categories={overflowCategories}
            startIndex={MAX_VISIBLE_PILLS}
            selectedIds={selectedIds}
            categoryCounts={categoryCounts}
            onToggle={handleToggle}
            overflowCount={overflowCategories.length}
          />
        )}
      </div>
    </div>
  );
};
