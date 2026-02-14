import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import {
  useInboxFilters,
  PRIORITY_RANGES,
} from 'hooks/useInboxFilters';

interface InboxFiltersProps {
  onFilterChange?: () => void;
}

export const InboxFilters: React.FC<InboxFiltersProps> = ({ onFilterChange }) => {
  const { t } = useTranslation();
  const {
    isFilterBarVisible,
    filters,
    connectedAccounts,
    availableCategories,
    loadingAccounts,
    loadingCategories,
    hasActiveFilters,
    toggleFilterBar,
    setAccountFilter,
    setCategoryFilter,
    setPriorityFilter,
    clearFilters,
  } = useInboxFilters();

  const handleAccountChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const options = Array.from(event.target.selectedOptions);
    const values = options.map(opt => opt.value);
    setAccountFilter(values);
    onFilterChange?.();
  };

  const handleCategoryChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const options = Array.from(event.target.selectedOptions);
    const values = options.map(opt => opt.value);
    setCategoryFilter(values);
    onFilterChange?.();
  };

  const handlePriorityChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    setPriorityFilter(value === 'all' ? null : Number(value));
    onFilterChange?.();
  };

  const handleClearFilters = () => {
    clearFilters();
    onFilterChange?.();
  };

  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <button
          onClick={toggleFilterBar}
          data-testid="filter-toggle-button"
          style={{
            padding: '8px 16px',
            fontSize: '14px',
            borderRadius: '4px',
            border: hasActiveFilters ? 'none' : `1px solid ${theme.borderColor}`,
            backgroundColor: hasActiveFilters ? theme.primary : 'transparent',
            color: hasActiveFilters ? 'white' : theme.text,
            cursor: 'pointer',
            fontWeight: hasActiveFilters ? 'bold' : 'normal',
          }}
        >
          {t('inbox.filters.toggle')}
          {hasActiveFilters && ' •'}
        </button>
        {hasActiveFilters && (
          <button
            onClick={handleClearFilters}
            style={{
              padding: '8px 16px',
              fontSize: '14px',
              borderRadius: '4px',
              border: 'none',
              backgroundColor: 'transparent',
              color: theme.primary,
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            {t('inbox.filters.clear')}
          </button>
        )}
      </div>

      {isFilterBarVisible && (
        <div
          style={{
            display: 'flex',
            gap: '16px',
            flexWrap: 'wrap',
            padding: '16px',
            backgroundColor: theme.surfaceBackground,
            borderRadius: '8px',
            border: `1px solid ${theme.borderColor}`,
          }}
        >
          {/* Account Filter */}
          <div style={{ minWidth: '200px', flex: '1' }}>
            <label
              htmlFor="account-filter"
              style={{
                display: 'block',
                marginBottom: '4px',
                fontSize: '12px',
                color: theme.textSecondary,
                fontWeight: '500',
              }}
            >
              {t('inbox.filters.account')}
            </label>
            <select
              id="account-filter"
              multiple
              value={filters.accountIds}
              onChange={handleAccountChange}
              disabled={loadingAccounts}
              style={{
                width: '100%',
                minHeight: '80px',
                padding: '8px',
                fontSize: '14px',
                borderRadius: '4px',
                border: `1px solid ${theme.borderColor}`,
                backgroundColor: theme.background,
                color: theme.text,
              }}
            >
              {loadingAccounts ? (
                <option disabled>{t('common.loading')}</option>
              ) : connectedAccounts.length === 0 ? (
                <option disabled>{t('inbox.filters.noAccounts')}</option>
              ) : (
                connectedAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.email} ({account.provider})
                  </option>
                ))
              )}
            </select>
            {filters.accountIds.length === 0 && (
              <div style={{ fontSize: '12px', color: theme.textSecondary, marginTop: '4px' }}>
                {t('inbox.filters.allAccounts')}
              </div>
            )}
          </div>

          {/* Category Filter */}
          <div style={{ minWidth: '200px', flex: '1' }}>
            <label
              htmlFor="category-filter"
              style={{
                display: 'block',
                marginBottom: '4px',
                fontSize: '12px',
                color: theme.textSecondary,
                fontWeight: '500',
              }}
            >
              {t('inbox.filters.category')}
            </label>
            <select
              id="category-filter"
              multiple
              value={filters.categories}
              onChange={handleCategoryChange}
              disabled={loadingCategories}
              style={{
                width: '100%',
                minHeight: '80px',
                padding: '8px',
                fontSize: '14px',
                borderRadius: '4px',
                border: `1px solid ${theme.borderColor}`,
                backgroundColor: theme.background,
                color: theme.text,
              }}
            >
              {loadingCategories ? (
                <option disabled>{t('common.loading')}</option>
              ) : availableCategories.length === 0 ? (
                <option disabled>{t('inbox.filters.noCategories')}</option>
              ) : (
                availableCategories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))
              )}
            </select>
            {filters.categories.length === 0 && (
              <div style={{ fontSize: '12px', color: theme.textSecondary, marginTop: '4px' }}>
                {t('inbox.filters.allCategories')}
              </div>
            )}
          </div>

          {/* Priority Filter */}
          <div style={{ minWidth: '150px', flex: '1' }}>
            <label
              htmlFor="priority-filter"
              style={{
                display: 'block',
                marginBottom: '4px',
                fontSize: '12px',
                color: theme.textSecondary,
                fontWeight: '500',
              }}
            >
              {t('inbox.filters.priority')}
            </label>
            <select
              id="priority-filter"
              value={filters.minPriority === null ? 'all' : filters.minPriority}
              onChange={handlePriorityChange}
              style={{
                width: '100%',
                padding: '8px',
                fontSize: '14px',
                borderRadius: '4px',
                border: `1px solid ${theme.borderColor}`,
                backgroundColor: theme.background,
                color: theme.text,
              }}
            >
              {PRIORITY_RANGES.map((range) => (
                <option
                  key={range.label}
                  value={range.value === null ? 'all' : range.value}
                >
                  {range.label}
                  {range.displayValue && ` (${range.displayValue})`}
                </option>
              ))}
            </select>
          </div>

          {/* Clear all button */}
          {hasActiveFilters && (
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button
                onClick={handleClearFilters}
                style={{
                  padding: '8px 16px',
                  fontSize: '14px',
                  borderRadius: '4px',
                  border: `1px solid ${theme.borderColor}`,
                  backgroundColor: 'transparent',
                  color: theme.text,
                  cursor: 'pointer',
                }}
              >
                {t('inbox.filters.clearAll')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
