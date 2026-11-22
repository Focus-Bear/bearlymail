/**
 * FilterMenu — one inbox filter: a quiet button that names the filter and its current choice,
 * opening a menu that holds the choices as a vertical list.
 *
 * UI-only: it owns nothing but its open/closed state.
 */
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { theme } from 'theme/theme';

import { KEY_ESCAPE } from 'constants/strings';

const MENU_MIN_WIDTH = '240px';
const MENU_MAX_HEIGHT = '360px';
const TRIGGER_HEIGHT = '32px';
/** Phone triggers and rows meet the 44px touch-target minimum. */
export const FILTER_TOUCH_TARGET = '44px';
const CHEVRON_SIZE = 12;

interface FilterMenuProps {
  /** Names the filter ("Category"); also the accessible name of the menu. */
  label: string;
  /** The current choice in words ("All", "Clients, Receipts"). */
  summary: string;
  /** True when the filter narrows the inbox, so the summary is worth emphasising. */
  isFiltering: boolean;
  /** Leave the label out of the button when the summary already names the filter ("All accounts"). */
  hideLabel?: boolean;
  /**
   * Phone layout: a taller button that shares the bar's width, and a menu that spans the
   * bar (the nearest positioned ancestor) rather than hanging off the button.
   */
  touch?: boolean;
  defaultOpen?: boolean;
  testId?: string;
  children: React.ReactNode;
}

const Chevron: React.FC<{ isOpen: boolean }> = ({ isOpen }) => (
  <svg
    aria-hidden="true"
    width={CHEVRON_SIZE}
    height={CHEVRON_SIZE}
    viewBox="0 0 12 12"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ flexShrink: 0, color: theme.colors.text.tertiary }}
  >
    <path d={isOpen ? 'M3 7.5l3-3 3 3' : 'M3 4.5l3 3 3-3'} />
  </svg>
);

function getTriggerStyle(isOpen: boolean, touch: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.xs,
    width: touch ? '100%' : undefined,
    maxWidth: '100%',
    height: touch ? FILTER_TOUCH_TARGET : TRIGGER_HEIGHT,
    padding: `0 ${theme.spacing.sm}`,
    fontFamily: 'inherit',
    fontSize: touch ? theme.typography.fontSize.lg : theme.typography.fontSize.md,
    color: theme.colors.text.secondary,
    backgroundColor: isOpen ? theme.colors.background.subtle : theme.colors.background.paper,
    border: `1px solid ${isOpen ? theme.colors.text.tertiary : theme.colors.border.medium}`,
    borderRadius: theme.borderRadius.sm,
    cursor: 'pointer',
    transition: theme.transitions.fast,
  };
}

function getPanelStyle(touch: boolean, alignRight: boolean): React.CSSProperties {
  const horizontal: React.CSSProperties = touch
    ? { left: theme.spacing.sm, right: theme.spacing.sm }
    : { left: alignRight ? undefined : 0, right: alignRight ? 0 : undefined, minWidth: MENU_MIN_WIDTH };
  return {
    ...horizontal,
    position: 'absolute',
    top: `calc(100% + ${theme.spacing.xs})`,
    maxHeight: MENU_MAX_HEIGHT,
    overflowY: 'auto',
    boxSizing: 'border-box',
    padding: `${theme.spacing.xs} 0`,
    backgroundColor: theme.colors.background.paper,
    border: `1px solid ${theme.colors.border.medium}`,
    borderRadius: theme.borderRadius.md,
    boxShadow: theme.shadows.lg,
    zIndex: 1000,
  };
}

export const FilterMenu: React.FC<FilterMenuProps> = ({
  label,
  summary,
  isFiltering,
  hideLabel = false,
  touch = false,
  defaultOpen = false,
  testId,
  children,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  /** A menu near the right edge would run off the screen, so it hangs from the button's right side instead. */
  const [alignRight, setAlignRight] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  useLayoutEffect(() => {
    if (!isOpen) {
      setAlignRight(false);
    } else if (!touch && panelRef.current) {
      setAlignRight(panelRef.current.getBoundingClientRect().right > window.innerWidth);
    }
  }, [isOpen, touch]);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === KEY_ESCAPE && isOpen) {
      event.stopPropagation();
      setIsOpen(false);
      triggerRef.current?.focus();
    }
  };

  return (
    <div
      ref={wrapperRef}
      onKeyDown={handleKeyDown}
      style={touch ? { flex: '1 1 0', minWidth: 0 } : { position: 'relative', minWidth: 0 }}
    >
      <button
        ref={triggerRef}
        type="button"
        data-testid={testId}
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-label={hideLabel ? `${label}: ${summary}` : undefined}
        onClick={() => setIsOpen(open => !open)}
        style={getTriggerStyle(isOpen, touch)}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {!hideLabel && `${label} `}
          <span
            style={{
              color: isFiltering ? theme.colors.text.primary : theme.colors.text.tertiary,
              fontWeight: isFiltering ? theme.typography.fontWeight.semibold : theme.typography.fontWeight.normal,
            }}
          >
            {summary}
          </span>
        </span>
        <Chevron isOpen={isOpen} />
      </button>
      {isOpen && (
        <div ref={panelRef} role="group" aria-label={label} style={getPanelStyle(touch, alignRight)}>
          {children}
        </div>
      )}
    </div>
  );
};
