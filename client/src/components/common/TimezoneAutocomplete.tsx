import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

const TIMEZONE_OPTIONS: string[] = (() => {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    return [
      'UTC',
      'America/New_York',
      'America/Chicago',
      'America/Denver',
      'America/Los_Angeles',
      'Europe/London',
      'Europe/Paris',
      'Europe/Berlin',
      'Asia/Tokyo',
      'Asia/Shanghai',
      'Asia/Kolkata',
      'Australia/Sydney',
      'Australia/Melbourne',
      'Pacific/Auckland',
    ];
  }
})();

interface TimezoneAutocompleteProps {
  value: string;
  onChange: (timezone: string) => void;
  style?: React.CSSProperties;
}

export const TimezoneAutocomplete: React.FC<TimezoneAutocompleteProps> = ({ value, onChange, style }) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filteredOptions = TIMEZONE_OPTIONS.filter(tz => tz.toLowerCase().includes(searchTerm.toLowerCase()));

  useEffect(() => {
    if (isOpen && highlightedIndex >= 0 && dropdownRef.current) {
      const highlightedElement = dropdownRef.current.children[highlightedIndex] as HTMLElement;
      if (highlightedElement) {
        highlightedElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex, isOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        inputRef.current &&
        !inputRef.current.contains(event.target as Node) &&
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

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
    setIsOpen(true);
    setHighlightedIndex(0);
  };

  const handleSelectTimezone = (timezone: string) => {
    onChange(timezone);
    setSearchTerm('');
    setIsOpen(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const KEY_ARROW_DOWN = 'ArrowDown';
    const KEY_ARROW_UP = 'ArrowUp';
    const KEY_ENTER = 'Enter';
    const KEY_ESCAPE = 'Escape';

    if (!isOpen && (event.key === KEY_ARROW_DOWN || event.key === KEY_ARROW_UP || event.key === KEY_ENTER)) {
      setIsOpen(true);
      return;
    }

    if (event.key === KEY_ARROW_DOWN) {
      event.preventDefault();
      setHighlightedIndex(prev => (prev < filteredOptions.length - 1 ? prev + 1 : prev));
    } else if (event.key === KEY_ARROW_UP) {
      event.preventDefault();
      setHighlightedIndex(prev => (prev > 0 ? prev - 1 : 0));
    } else if (event.key === KEY_ENTER && isOpen && filteredOptions.length > 0) {
      event.preventDefault();
      handleSelectTimezone(filteredOptions[highlightedIndex]);
    } else if (event.key === KEY_ESCAPE) {
      setIsOpen(false);
      setSearchTerm('');
    }
  };

  const displayValue = searchTerm || value.replace(/_/g, ' ');

  return (
    <div style={{ position: 'relative', ...style }}>
      <input
        ref={inputRef}
        type="text"
        value={displayValue}
        onChange={handleInputChange}
        onFocus={() => setIsOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={t('common.searchTimezonePlaceholder')}
        style={{
          width: '100%',
          padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
          borderRadius: theme.borderRadius.sm,
          border: `1px solid ${theme.colors.border.medium}`,
          fontSize: theme.typography.fontSize.sm,
          backgroundColor: theme.colors.background.paper,
          color: theme.colors.text.primary,
          minWidth: '250px',
        }}
      />
      {isOpen && filteredOptions.length > 0 && (
        <TimezoneDropdown
          dropdownRef={dropdownRef}
          options={filteredOptions}
          highlightedIndex={highlightedIndex}
          onSelect={handleSelectTimezone}
          onHighlight={setHighlightedIndex}
        />
      )}
    </div>
  );
};

const TimezoneDropdown: React.FC<{
  dropdownRef: React.RefObject<HTMLDivElement | null>;
  options: string[];
  highlightedIndex: number;
  onSelect: (tz: string) => void;
  onHighlight: (index: number) => void;
}> = ({ dropdownRef, options, highlightedIndex, onSelect, onHighlight }) => (
  <div
    ref={dropdownRef}
    style={{
      position: 'absolute',
      top: '100%',
      left: 0,
      right: 0,
      maxHeight: '200px',
      overflowY: 'auto',
      backgroundColor: theme.colors.background.paper,
      border: `1px solid ${theme.colors.border.medium}`,
      borderTop: 'none',
      borderRadius: `0 0 ${theme.borderRadius.sm} ${theme.borderRadius.sm}`,
      boxShadow: theme.shadows.md,
      zIndex: 1000,
    }}
  >
    {options.map((tz, index) => (
      <div
        key={tz}
        onClick={() => onSelect(tz)}
        onMouseEnter={() => onHighlight(index)}
        style={{
          padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
          cursor: 'pointer',
          backgroundColor: index === highlightedIndex ? theme.colors.background.hover : 'transparent',
          fontSize: theme.typography.fontSize.sm,
          color: theme.colors.text.primary,
        }}
      >
        {tz.replace(/_/g, ' ')}
      </div>
    ))}
  </div>
);
