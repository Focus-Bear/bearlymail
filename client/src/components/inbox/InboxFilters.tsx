import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { COLOR_TRANSPARENT } from 'constants/colors';
import type { ConnectedAccount, InboxFilter } from 'hooks/useInboxFilters';
import { PRIORITY_RANGES } from 'hooks/useInboxFilters';

import { getMultiSelectDisplayText } from './inboxFilters.helpers';

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
    <span style={{ fontSize: theme.typography.fontSize.lg, color: theme.colors.text.primary }}>
      {option.label}
    </span>
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
}) => (
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

// Single-select dropdown component for priority ranges (min + max)
interface PriorityRangeOption {
  label: string;
  min: number | null;
  max: number | null;
  displayValue?: string;
}

interface SingleSelectDropdownProps {
  label: string;
  options: readonly PriorityRangeOption[];
  selectedMin: number | null;
  selectedMax: number | null;
  onChange: (min: number | null, max: number | null) => void;
}

interface SingleSelectOptionsListProps {
  options: readonly PriorityRangeOption[];
  selectedMin: number | null;
  selectedMax: number | null;
  onSelect: (min: number | null, max: number | null) => void;
}

const SingleSelectOptionsList: React.FC<SingleSelectOptionsListProps> = ({ options, selectedMin, selectedMax, onSelect }) => (
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
    {options.map(option => {
      // Compare both min and max to determine selection
      const minMatch = option.min === selectedMin;
      const maxMatch = option.max === selectedMax;
      const isSelected = minMatch && maxMatch;
      return (
        <div
          key={option.label}
          onClick={() => onSelect(option.min, option.max)}
          style={{
            padding: `${theme.spacing.sm} ${theme.spacing.md}`,
            cursor: 'pointer',
            backgroundColor: isSelected ? theme.colors.background.subtle : 'transparent',
            fontSize: theme.typography.fontSize.lg,
            color: theme.colors.text.primary,
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
);

const SingleSelectDropdown: React.FC<SingleSelectDropdownProps> = ({ label, options, selectedMin, selectedMax, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = options.find(opt => opt.min === selectedMin && opt.max === selectedMax);
  const displayText = selectedOption
    ? `${selectedOption.label}${selectedOption.displayValue ? ` (${selectedOption.displayValue})` : ''}`
    : options[0]?.label || 'Select...';

  return (
    <div ref={dropdownRef} style={{ position: 'relative', minWidth: '180px', flex: '1' }}>
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
        <SingleSelectOptionsList
          options={options}
          selectedMin={selectedMin}
          selectedMax={selectedMax}
          onSelect={(min, max) => {
            onChange(min, max);
            setIsOpen(false);
          }}
        />
      )}
    </div>
  );
};

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
}) => {
  const { t } = useTranslation();

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

  const categoryOptions = availableCategories.map(category => ({
    id: category.id,
    label: category.label,
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
        gap: theme.spacing.md,
        flexWrap: 'wrap',
        padding: theme.spacing.md,
        backgroundColor: theme.colors.background.paper,
        borderBottom: `1px solid ${theme.colors.border.light}`,
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
          searchable
          emptyMessage={t('inbox.filters.noCategories')}
        />
      )}

      {/* Priority Filter */}
      <SingleSelectDropdown
        label={t('inbox.filters.priority')}
        options={PRIORITY_RANGES}
        selectedMin={filters.minPriority}
        selectedMax={filters.maxPriority}
        onChange={handlePriorityChange}
      />
    </div>
  );
};
