import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { FiFilter } from 'react-icons/fi';
import { theme } from 'theme/theme';
import {
  useInboxFilters,
  PRIORITY_RANGES,
} from 'hooks/useInboxFilters';

interface InboxFiltersProps {
  onFilterChange?: () => void;
}

// Multi-select dropdown component with search
interface MultiSelectDropdownProps {
  label: string;
  options: Array<{ id: string; label: string }>;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
  searchable?: boolean;
  emptyMessage?: string;
}

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
    ? options.filter((opt) =>
        opt.label.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : options;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
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
      onChange(selectedIds.filter((selectedId) => selectedId !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  const selectedCount = selectedIds.length;
  const displayText =
    selectedCount === 0
      ? placeholder
      : selectedCount === 1
      ? options.find((opt) => opt.id === selectedIds[0])?.label || placeholder
      : `${selectedCount} selected`;

  return (
    <div ref={dropdownRef} style={{ position: 'relative', minWidth: '200px', flex: '1' }}>
      <label
        style={{
          display: 'block',
          marginBottom: theme.spacing.xs,
          fontSize: theme.typography.fontSize.sm,
          color: theme.colors.text.secondary,
          fontWeight: theme.typography.fontWeight.medium,
        }}
      >
        {label}
      </label>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
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

      {isOpen && (
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
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search..."
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
              filteredOptions.map((option) => {
                const isSelected = selectedIds.includes(option.id);
                return (
                  <label
                    key={option.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                      cursor: 'pointer',
                      backgroundColor: isSelected ? theme.colors.background.subtle : 'transparent',
                      transition: theme.transitions.fast,
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.backgroundColor = theme.colors.background.subtle;
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleToggle(option.id)}
                      style={{
                        marginRight: theme.spacing.sm,
                        cursor: 'pointer',
                        width: '16px',
                        height: '16px',
                        accentColor: theme.colors.primary.main,
                      }}
                    />
                    <span
                      style={{
                        fontSize: theme.typography.fontSize.lg,
                        color: theme.colors.text.primary,
                      }}
                    >
                      {option.label}
                    </span>
                  </label>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// Single-select dropdown component
interface SingleSelectDropdownProps {
  label: string;
  options: Array<{ value: string | number | null; label: string; displayValue?: string }>;
  selectedValue: string | number | null;
  onChange: (value: number | null) => void;
}

const SingleSelectDropdown: React.FC<SingleSelectDropdownProps> = ({
  label,
  options,
  selectedValue,
  onChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = options.find((opt) => opt.value === selectedValue);
  const displayText = selectedOption
    ? `${selectedOption.label}${selectedOption.displayValue ? ` (${selectedOption.displayValue})` : ''}`
    : options[0]?.label || 'Select...';

  return (
    <div ref={dropdownRef} style={{ position: 'relative', minWidth: '180px', flex: '1' }}>
      <label
        style={{
          display: 'block',
          marginBottom: theme.spacing.xs,
          fontSize: theme.typography.fontSize.sm,
          color: theme.colors.text.secondary,
          fontWeight: theme.typography.fontWeight.medium,
        }}
      >
        {label}
      </label>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '100%',
          padding: `${theme.spacing.sm} ${theme.spacing.md}`,
          fontSize: theme.typography.fontSize.lg,
          borderRadius: theme.borderRadius.md,
          border: `1px solid ${theme.colors.border.medium}`,
          backgroundColor: theme.colors.background.paper,
          color: theme.colors.text.primary,
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

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: theme.spacing.xs,
            maxHeight: '280px',
            overflowY: 'auto',
            backgroundColor: theme.colors.background.paper,
            border: `1px solid ${theme.colors.border.medium}`,
            borderRadius: theme.borderRadius.md,
            boxShadow: theme.shadows.lg,
            zIndex: 1000,
          }}
        >
          {options.map((option) => {
            const isSelected = option.value === selectedValue;
            return (
              <div
                key={String(option.value)}
                onClick={() => {
                  onChange(option.value === 'all' ? null : Number(option.value));
                  setIsOpen(false);
                }}
                style={{
                  padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                  cursor: 'pointer',
                  backgroundColor: isSelected ? theme.colors.background.subtle : 'transparent',
                  fontSize: theme.typography.fontSize.lg,
                  color: theme.colors.text.primary,
                  transition: theme.transitions.fast,
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.backgroundColor = theme.colors.background.subtle;
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }
                }}
              >
                {option.label}
                {option.displayValue && (
                  <span style={{ color: theme.colors.text.tertiary, marginLeft: theme.spacing.xs }}>
                    {option.displayValue}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

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

  const handleAccountChange = (ids: string[]) => {
    setAccountFilter(ids);
    onFilterChange?.();
  };

  const handleCategoryChange = (ids: string[]) => {
    setCategoryFilter(ids);
    onFilterChange?.();
  };

  const handlePriorityChange = (value: number | null) => {
    setPriorityFilter(value);
    onFilterChange?.();
  };

  const handleClearFilters = () => {
    clearFilters();
    onFilterChange?.();
  };

  const accountOptions = connectedAccounts.map((account) => ({
    id: account.id,
    label: `${account.email} (${account.provider})`,
  }));

  const categoryOptions = availableCategories.map((category) => ({
    id: category,
    label: category,
  }));

  // Hide account filter if only one account
  const showAccountFilter = connectedAccounts.length > 1;

  return (
    <div style={{ marginBottom: theme.spacing.md }}>
      {/* Filter toggle button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm, marginBottom: theme.spacing.sm }}>
        <button
          onClick={toggleFilterBar}
          data-testid="filter-toggle-button"
          style={{
            padding: `${theme.spacing.sm} ${theme.spacing.md}`,
            fontSize: theme.typography.fontSize.lg,
            borderRadius: theme.borderRadius.md,
            border: hasActiveFilters ? 'none' : `1px solid ${theme.colors.border.medium}`,
            backgroundColor: hasActiveFilters ? theme.colors.primary.main : theme.colors.background.paper,
            color: hasActiveFilters ? 'white' : theme.colors.text.primary,
            cursor: 'pointer',
            fontWeight: hasActiveFilters ? theme.typography.fontWeight.semibold : theme.typography.fontWeight.normal,
            display: 'flex',
            alignItems: 'center',
            gap: theme.spacing.xs,
            transition: theme.transitions.default,
            boxShadow: hasActiveFilters ? theme.shadows.sm : 'none',
          }}
          onMouseEnter={(e) => {
            if (!hasActiveFilters) {
              e.currentTarget.style.backgroundColor = theme.colors.background.subtle;
            } else {
              e.currentTarget.style.backgroundColor = theme.colors.primary.light;
            }
          }}
          onMouseLeave={(e) => {
            if (!hasActiveFilters) {
              e.currentTarget.style.backgroundColor = theme.colors.background.paper;
            } else {
              e.currentTarget.style.backgroundColor = theme.colors.primary.main;
            }
          }}
        >
          <FiFilter size={18} />
          <span>{t('inbox.filters.toggle')}</span>
          {hasActiveFilters && (
            <span
              style={{
                backgroundColor: 'white',
                color: theme.colors.primary.main,
                borderRadius: theme.borderRadius.full,
                padding: `0 ${theme.spacing.xs}`,
                fontSize: theme.typography.fontSize.sm,
                fontWeight: theme.typography.fontWeight.bold,
                minWidth: '20px',
                textAlign: 'center',
              }}
            >
              {(filters.accountIds.length > 0 ? 1 : 0) +
                (filters.categories.length > 0 ? 1 : 0) +
                (filters.minPriority !== null ? 1 : 0)}
            </span>
          )}
        </button>
        {hasActiveFilters && (
          <button
            onClick={handleClearFilters}
            style={{
              padding: `${theme.spacing.sm} ${theme.spacing.md}`,
              fontSize: theme.typography.fontSize.lg,
              borderRadius: theme.borderRadius.md,
              border: 'none',
              backgroundColor: 'transparent',
              color: theme.colors.primary.main,
              cursor: 'pointer',
              textDecoration: 'underline',
              transition: theme.transitions.fast,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = theme.colors.primary.light;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = theme.colors.primary.main;
            }}
          >
            {t('inbox.filters.clear')}
          </button>
        )}
      </div>

      {/* Filter bar */}
      {isFilterBarVisible && (
        <div
          style={{
            display: 'flex',
            gap: theme.spacing.md,
            flexWrap: 'wrap',
            padding: theme.spacing.md,
            backgroundColor: theme.colors.background.paper,
            borderRadius: theme.borderRadius.lg,
            border: `1px solid ${theme.colors.border.light}`,
            boxShadow: theme.shadows.sm,
          }}
        >
          {/* Account Filter - only show if more than 1 account */}
          {showAccountFilter && !loadingAccounts && (
            <MultiSelectDropdown
              label={t('inbox.filters.account')}
              options={accountOptions}
              selectedIds={filters.accountIds}
              onChange={handleAccountChange}
              placeholder={t('inbox.filters.allAccounts')}
              emptyMessage={t('inbox.filters.noAccounts')}
            />
          )}

          {/* Category Filter - with search */}
          {!loadingCategories && categoryOptions.length > 0 && (
            <MultiSelectDropdown
              label={t('inbox.filters.category')}
              options={categoryOptions}
              selectedIds={filters.categories}
              onChange={handleCategoryChange}
              placeholder={t('inbox.filters.allCategories')}
              searchable={true}
              emptyMessage={t('inbox.filters.noCategories')}
            />
          )}

          {/* Priority Filter */}
          <SingleSelectDropdown
            label={t('inbox.filters.priority')}
            options={PRIORITY_RANGES}
            selectedValue={filters.minPriority}
            onChange={handlePriorityChange}
          />
        </div>
      )}
    </div>
  );
};
