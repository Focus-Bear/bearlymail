import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

export interface ProjectStatusOption {
  id: string;
  name: string;
  color: string;
}

interface ProjectStatusSelectorProps {
  /** Available project status options fetched from the GitHub Projects v2 API. */
  options: ProjectStatusOption[];
  /** Currently selected option id. */
  selectedId: string;
  /** Called when the user selects an option. */
  onSelect: (id: string) => void;
  /** Whether options are currently being loaded. */
  loading?: boolean;
}

/** Map GitHub Projects v2 color names to CSS color values. */
const COLOR_MAP: Record<string, string> = {
  RED: '#e11d48',
  ORANGE: '#f97316',
  YELLOW: '#eab308',
  GREEN: '#22c55e',
  BLUE: '#3b82f6',
  PURPLE: '#a855f7',
  PINK: '#ec4899',
  GRAY: '#6b7280',
  GREY: '#6b7280',
};

/** Dropdown listbox element id used to link the combobox input to its popup via aria-controls. */
const LISTBOX_ID = 'project-status-listbox';

function resolveColor(color: string): string {
  if (!color) {
    return theme.colors.border.medium;
  }
  const upper = color.toUpperCase();
  return COLOR_MAP[upper] ?? theme.colors.border.medium;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface ColorDotProps {
  color: string;
  style?: React.CSSProperties;
}

function ColorDot({ color, style }: ColorDotProps) {
  return (
    <span
      aria-hidden="true"
      data-testid="color-dot"
      style={{
        width: 10,
        height: 10,
        borderRadius: '50%',
        backgroundColor: resolveColor(color),
        flexShrink: 0,
        ...style,
      }}
    />
  );
}

interface StatusOptionItemProps {
  option: ProjectStatusOption;
  isSelected: boolean;
  onMouseDown: () => void;
}

function StatusOptionItem({ option, isSelected, onMouseDown }: StatusOptionItemProps) {
  const [isHovered, setIsHovered] = useState(false);

  let backgroundColor = 'transparent';
  if (isHovered) {
    backgroundColor = theme.colors.background.subtle;
  } else if (isSelected) {
    backgroundColor = theme.colors.primary.subtle;
  }

  return (
    <li
      key={option.id}
      role="option"
      aria-selected={isSelected}
      onMouseDown={onMouseDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: theme.spacing.sm,
        padding: `${theme.spacing.sm} ${theme.spacing.md}`,
        cursor: 'pointer',
        fontSize: theme.typography.fontSize.sm,
        color: isSelected ? theme.colors.primary.main : theme.colors.text.primary,
        backgroundColor,
      }}
    >
      <ColorDot color={option.color} />
      <span>{option.name}</span>
    </li>
  );
}

interface StatusDropdownProps {
  options: ProjectStatusOption[];
  selectedId: string;
  onSelect: (option: ProjectStatusOption) => void;
}

function StatusDropdown({ options, selectedId, onSelect }: StatusDropdownProps) {
  return (
    <ul
      id={LISTBOX_ID}
      role="listbox"
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
      {options.map(option => (
        <StatusOptionItem
          key={option.id}
          option={option}
          isSelected={option.id === selectedId}
          onMouseDown={() => onSelect(option)}
        />
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * Typeahead combobox that renders a filtered list of GitHub Projects v2 status
 * options as the user types, with color-coded dots for each option.
 * Uses ID-based selection to ensure accurate field updates.
 */
export const ProjectStatusSelector: React.FC<ProjectStatusSelectorProps> = ({
  options,
  selectedId,
  onSelect,
  loading = false,
}) => {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  // Tracks when user is in the middle of selecting an option (mousedown→blur window).
  // This avoids the race condition of closing the dropdown before the click registers.
  const isSelectingRef = useRef(false);

  const selectedOption = options.find(opt => opt.id === selectedId) ?? null;
  const [inputValue, setInputValue] = useState(selectedOption?.name ?? '');
  const [isOpen, setIsOpen] = useState(false);

  // Sync input text when selectedId changes externally
  useEffect(() => {
    const matchedOption = options.find(opt => opt.id === selectedId);
    setInputValue(matchedOption?.name ?? '');
  }, [selectedId, options]);

  const filtered = inputValue.trim()
    ? options.filter(opt => opt.name.toLowerCase().includes(inputValue.toLowerCase()))
    : options;

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(event.target.value);
    setIsOpen(true);
    // Do NOT call onSelect here — only fire onSelect on an actual option selection,
    // not on every keystroke during typing.
  };

  const handleSelect = (option: ProjectStatusOption) => {
    setInputValue(option.name);
    onSelect(option.id);
    setIsOpen(false);
    isSelectingRef.current = false;
  };

  const handleFocus = () => {
    if (options.length > 0) {
      setIsOpen(true);
    }
  };

  const handleBlur = () => {
    // If the user is in the middle of clicking an option, defer the close
    // until the mousedown handler fires. This avoids closing before the click lands.
    if (!isSelectingRef.current) {
      setIsOpen(false);
    }
  };

  const handleOptionMouseDown = (option: ProjectStatusOption) => {
    isSelectingRef.current = true;
    handleSelect(option);
  };

  if (loading) {
    return (
      <div style={{ marginBottom: theme.spacing.lg }}>
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
        <p style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.sm }}>
          {t('quickActions.github.loadingStatuses', { defaultValue: 'Loading statuses…' })}
        </p>
      </div>
    );
  }

  if (!loading && options.length === 0) {
    return (
      <div style={{ marginBottom: theme.spacing.lg }}>
        <p style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.sm }}>
          {t('quickActions.github.noStatusOptions', { defaultValue: 'No status options found for this project.' })}
        </p>
      </div>
    );
  }

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

      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        {/* Color dot for the currently selected option */}
        {selectedOption && (
          <ColorDot
            color={selectedOption.color}
            style={{
              position: 'absolute',
              left: theme.spacing.sm,
              pointerEvents: 'none',
            }}
          />
        )}
        <input
          type="text"
          role="combobox"
          aria-expanded={isOpen}
          aria-autocomplete="list"
          aria-controls={LISTBOX_ID}
          value={inputValue}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={t('quickActions.github.searchStatus', { defaultValue: 'Search or type a status…' })}
          autoComplete="off"
          style={{
            width: '100%',
            padding: `${theme.spacing.sm} ${theme.spacing.md}`,
            paddingLeft: selectedOption ? '28px' : theme.spacing.md,
            fontSize: theme.typography.fontSize.sm,
            border: `1px solid ${theme.colors.border.medium}`,
            borderRadius: theme.borderRadius.md,
            outline: 'none',
            boxSizing: 'border-box',
            color: theme.colors.text.primary,
            backgroundColor: theme.colors.background.paper,
          }}
        />
      </div>

      {isOpen && filtered.length > 0 && (
        <StatusDropdown options={filtered} selectedId={selectedId} onSelect={handleOptionMouseDown} />
      )}
    </div>
  );
};
