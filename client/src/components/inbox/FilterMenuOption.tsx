/**
 * Rows and footer for the lists inside a FilterMenu: a standard checkbox, the choice's name,
 * and how many emails it holds.
 */
import React from 'react';
import { theme } from 'theme/theme';

import { COLOR_TRANSPARENT } from 'constants/colors';

import { FILTER_TOUCH_TARGET } from './FilterMenu';

const CHECKBOX_SIZE = '16px';
const DOT_SIZE = '8px';
const ROW_MIN_HEIGHT = '32px';

interface FilterMenuOptionProps {
  label: string;
  count?: number;
  /** Small colour key shown before the label (priority levels). */
  dotColor?: string;
  isChecked: boolean;
  isDisabled?: boolean;
  touch?: boolean;
  testId?: string;
  onToggle: () => void;
}

export const FilterMenuOption: React.FC<FilterMenuOptionProps> = ({
  label,
  count,
  dotColor,
  isChecked,
  isDisabled = false,
  touch = false,
  testId,
  onToggle,
}) => (
  <label
    data-testid={testId}
    title={label}
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: theme.spacing.sm,
      minHeight: touch ? FILTER_TOUCH_TARGET : ROW_MIN_HEIGHT,
      boxSizing: 'border-box',
      padding: `${theme.spacing.xs} ${theme.spacing.md}`,
      fontSize: theme.typography.fontSize.lg,
      color: theme.colors.text.primary,
      backgroundColor: isChecked ? theme.colors.background.subtle : COLOR_TRANSPARENT,
      cursor: isDisabled ? 'default' : 'pointer',
      userSelect: 'none',
    }}
    onMouseEnter={event => {
      event.currentTarget.style.backgroundColor = theme.colors.background.subtle;
    }}
    onMouseLeave={event => {
      event.currentTarget.style.backgroundColor = isChecked ? theme.colors.background.subtle : COLOR_TRANSPARENT;
    }}
  >
    <input
      type="checkbox"
      checked={isChecked}
      disabled={isDisabled}
      onChange={onToggle}
      aria-label={label}
      style={{
        width: CHECKBOX_SIZE,
        height: CHECKBOX_SIZE,
        margin: 0,
        flexShrink: 0,
        cursor: 'inherit',
        accentColor: theme.colors.primary.dark,
      }}
    />
    {dotColor && (
      <span
        aria-hidden="true"
        style={{ width: DOT_SIZE, height: DOT_SIZE, flexShrink: 0, borderRadius: '50%', backgroundColor: dotColor }}
      />
    )}
    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
      {label}
    </span>
    {count !== undefined && (
      <span
        style={{
          flexShrink: 0,
          fontSize: theme.typography.fontSize.sm,
          color: theme.colors.text.tertiary,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {count}
      </span>
    )}
  </label>
);

interface FilterMenuFooterProps {
  /** What the current choice amounts to ("2 selected"). */
  status?: string;
  /** Label of the button that drops this filter ("Show all"). */
  resetLabel: string;
  onReset: () => void;
  touch?: boolean;
  resetTestId?: string;
}

/** Closes a menu's list: sums up the choice and offers the way back to everything. */
export const FilterMenuFooter: React.FC<FilterMenuFooterProps> = ({
  status,
  resetLabel,
  onReset,
  touch = false,
  resetTestId,
}) => (
  <div
    style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: theme.spacing.sm,
      marginTop: theme.spacing.xs,
      padding: `${theme.spacing.xs} ${theme.spacing.md} 0`,
      borderTop: `1px solid ${theme.colors.border.light}`,
    }}
  >
    <span style={{ fontSize: theme.typography.fontSize.sm, color: theme.colors.text.tertiary }}>{status}</span>
    <button
      type="button"
      data-testid={resetTestId}
      onClick={onReset}
      style={{
        minHeight: touch ? FILTER_TOUCH_TARGET : ROW_MIN_HEIGHT,
        padding: 0,
        fontFamily: 'inherit',
        fontSize: theme.typography.fontSize.md,
        color: theme.colors.text.secondary,
        textDecoration: 'underline',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
      }}
    >
      {resetLabel}
    </button>
  </div>
);
