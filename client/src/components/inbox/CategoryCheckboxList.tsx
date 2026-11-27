/**
 * CategoryCheckboxList — the category filter's choices as a vertical checkbox list, one row per
 * category with its email count. No box ticked means every category is shown.
 *
 * UI-only component — no state management, localStorage, or API concerns.
 */
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { FilterMenuFooter, FilterMenuOption } from './FilterMenuOption';

export const CATEGORY_CHECKBOX_TEST_ID_PREFIX = 'category-checkbox-';
export const CATEGORY_SHOW_ALL_TEST_ID = 'category-show-all';

/** A list longer than this gets a search box; shorter ones are quicker to scan than to type into. */
const SEARCH_THRESHOLD = 8;
const SKELETON_ROW_WIDTHS = ['70%', '50%', '62%', '44%'];
const SKELETON_ROW_HEIGHT = '14px';

interface CategoryCheckboxListProps {
  categories: Array<{ id: string; label: string }>;
  selectedIds: string[];
  /** Called with the new selection; an empty array means "all categories". */
  onChange: (ids: string[]) => void;
  /** Per-category email counts, keyed by category id. */
  categoryCounts?: Record<string, number>;
  /**
   * True while categories or their counts are being fetched: counts are held back rather than
   * shown stale (fix #1466), and an empty list shows placeholder rows instead of "none yet".
   */
  loading?: boolean;
  touch?: boolean;
}

const messageStyle: React.CSSProperties = {
  padding: `${theme.spacing.sm} ${theme.spacing.md}`,
  fontSize: theme.typography.fontSize.md,
  color: theme.colors.text.tertiary,
};

const SkeletonRows: React.FC = () => (
  <div aria-hidden="true">
    {SKELETON_ROW_WIDTHS.map(width => (
      <div key={width} style={{ padding: `${theme.spacing.sm} ${theme.spacing.md}` }}>
        <div
          style={{
            width,
            height: SKELETON_ROW_HEIGHT,
            borderRadius: theme.borderRadius.sm,
            backgroundColor: theme.colors.background.disabled,
            animation: 'bearlymail-skeleton-pulse 1.2s ease-in-out infinite',
          }}
        />
      </div>
    ))}
  </div>
);

export const CategoryCheckboxList: React.FC<CategoryCheckboxListProps> = ({
  categories,
  selectedIds,
  onChange,
  categoryCounts,
  loading = false,
  touch = false,
}) => {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');

  const isSearchable = categories.length > SEARCH_THRESHOLD;
  const needle = searchTerm.trim().toLowerCase();
  const visibleCategories = needle ? categories.filter(cat => cat.label.toLowerCase().includes(needle)) : categories;

  const handleToggle = (id: string) => {
    onChange(selectedIds.includes(id) ? selectedIds.filter(selectedId => selectedId !== id) : [...selectedIds, id]);
  };

  return (
    <>
      {isSearchable && (
        <div style={{ padding: `${theme.spacing.xs} ${theme.spacing.sm} ${theme.spacing.sm}` }}>
          <input
            type="search"
            value={searchTerm}
            onChange={event => setSearchTerm(event.target.value)}
            placeholder={t('inbox.filters.searchCategories')}
            aria-label={t('inbox.filters.searchCategories')}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
              fontFamily: 'inherit',
              fontSize: theme.typography.fontSize.md,
              color: theme.colors.text.primary,
              backgroundColor: theme.colors.background.paper,
              border: `1px solid ${theme.colors.border.medium}`,
              borderRadius: theme.borderRadius.sm,
            }}
          />
        </div>
      )}
      {loading && categories.length === 0 && <SkeletonRows />}
      {!loading && categories.length === 0 && <div style={messageStyle}>{t('inbox.filters.noCategories')}</div>}
      {categories.length > 0 && visibleCategories.length === 0 && (
        <div style={messageStyle}>{t('inbox.filters.noMatchingCategories')}</div>
      )}
      {visibleCategories.map(cat => (
        <FilterMenuOption
          key={cat.id}
          testId={`${CATEGORY_CHECKBOX_TEST_ID_PREFIX}${cat.id}`}
          label={cat.label}
          count={loading ? undefined : categoryCounts?.[cat.id]}
          isChecked={selectedIds.includes(cat.id)}
          touch={touch}
          onToggle={() => handleToggle(cat.id)}
        />
      ))}
      {selectedIds.length > 0 && (
        <FilterMenuFooter
          status={t('inbox.filters.nCategoriesSelected', { count: selectedIds.length })}
          resetLabel={t('inbox.filters.showAll')}
          resetTestId={CATEGORY_SHOW_ALL_TEST_ID}
          onReset={() => onChange([])}
          touch={touch}
        />
      )}
    </>
  );
};
