import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

export interface StatusOption {
  id: string;
  name: string;
}

interface StatusSelectorProps {
  /** Available status options fetched from the GitHub Projects v2 API. */
  options: StatusOption[];
  /** Currently selected status name. */
  value: string;
  /** Called when the user selects or types a status. */
  onChange: (value: string) => void;
  /** Whether options are currently being loaded. */
  loading?: boolean;
}

/** Delay in milliseconds before hiding the dropdown on blur, allowing click events on options to fire first. */
const BLUR_CLOSE_DELAY_MS = 150;

/**
 * Typeahead status selector that renders a filtered list of GitHub project
 * status options as the user types. Falls back gracefully when no options
 * are available (e.g. the issue is not linked to a project).
 */
export const StatusSelector: React.FC<StatusSelectorProps> = ({ options, value, onChange, loading = false }) => {
  const { t } = useTranslation();
  const [inputValue, setInputValue] = useState(value);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Keep the text input in sync when the parent value changes externally
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  const filtered = inputValue.trim()
    ? options.filter(opt => opt.name.toLowerCase().includes(inputValue.toLowerCase()))
    : options;

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const next = event.target.value;
    setInputValue(next);
    onChange(next);
    setIsOpen(true);
  };

  const handleSelect = (option: StatusOption) => {
    setInputValue(option.name);
    onChange(option.name);
    setIsOpen(false);
  };

  const handleFocus = () => {
    if (options.length > 0) {
      setIsOpen(true);
    }
  };

  const handleBlur = (event: React.FocusEvent) => {
    // Delay so that click on an option registers before blur hides the list
    if (!containerRef.current?.contains(event.relatedTarget as Node)) {
      setTimeout(() => setIsOpen(false), BLUR_CLOSE_DELAY_MS);
    }
  };

  return (
    <div ref={containerRef} style={{ marginBottom: theme.spacing.lg, position: 'relative' }}>
      <label
        style={{
          display: 'block',
          marginBottom: theme.spacing.sm,
          color: theme.colors.text.primary,
          fontWeight: theme.typography.fontWeight.medium,
        }}
      >
        {t('quickActions.github.status')}
      </label>

      <input
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={
          loading
            ? t('quickActions.github.loadingStatuses', { defaultValue: 'Loading statuses…' })
            : t('quickActions.github.searchStatus', { defaultValue: 'Search or type a status…' })
        }
        disabled={loading}
        autoComplete="off"
        style={{
          width: '100%',
          padding: `${theme.spacing.sm} ${theme.spacing.md}`,
          fontSize: theme.typography.fontSize.sm,
          border: `1px solid ${theme.colors.border.medium}`,
          borderRadius: theme.borderRadius.md,
          outline: 'none',
          boxSizing: 'border-box',
          color: theme.colors.text.primary,
          backgroundColor: theme.colors.background.paper,
        }}
      />

      {isOpen && filtered.length > 0 && (
        <ul
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 10,
            listStyle: 'none',
            margin: 0,
            padding: 0,
            backgroundColor: theme.colors.background.paper,
            border: `1px solid ${theme.colors.border.medium}`,
            borderRadius: theme.borderRadius.md,
            boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
            maxHeight: '180px',
            overflowY: 'auto',
          }}
        >
          {filtered.map(option => (
            <li
              key={option.id}
              onMouseDown={() => handleSelect(option)}
              style={{
                padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                cursor: 'pointer',
                fontSize: theme.typography.fontSize.sm,
                color: option.name === value ? theme.colors.primary.main : theme.colors.text.primary,
                backgroundColor: option.name === value ? theme.colors.primary.subtle : 'transparent',
              }}
              onMouseEnter={event => {
                (event.currentTarget as HTMLLIElement).style.backgroundColor = theme.colors.background.subtle;
              }}
              onMouseLeave={event => {
                (event.currentTarget as HTMLLIElement).style.backgroundColor =
                  option.name === value ? theme.colors.primary.subtle : 'transparent';
              }}
            >
              {option.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
