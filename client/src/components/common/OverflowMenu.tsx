import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { theme } from 'theme/theme';

import { COLOR_TRANSPARENT } from 'constants/colors';
import { TOUCH_TARGET_MIN_PX } from 'constants/layout';
import { KEY_ESCAPE, STRING_NONE } from 'constants/strings';

const OVERFLOW_MENU_ICON = '\u22EE';

export interface OverflowMenuItem {
  key: string;
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
}

interface OverflowMenuProps {
  items: OverflowMenuItem[];
  'aria-label'?: string;
}

/**
 * A reusable vertical three-dot (⋮) overflow menu component.
 * Renders a button that toggles a dropdown list; clicking outside or pressing
 * Escape closes the menu. Fully keyboard-accessible with ARIA attributes.
 */
interface DropdownPosition {
  top: number;
  right: number;
}

export const OverflowMenu: React.FC<OverflowMenuProps> = ({ items, 'aria-label': ariaLabel = 'More options' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<DropdownPosition | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setIsOpen(false);
    setDropdownPos(null);
  }, []);

  const open = useCallback(() => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom,
        right: window.innerWidth - rect.right,
      });
    }
    setIsOpen(true);
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target;
      // The dropdown is portalled to document.body, so it is NOT inside
      // containerRef — checking only the container treats a mousedown on a
      // menu item as an outside click, unmounting the item before its click
      // event can fire (menu items would silently do nothing). Non-Node
      // targets (e.g. Window from scrollbar clicks) count as outside —
      // contains() would throw on them.
      if (
        target instanceof Node &&
        (containerRef.current?.contains(target) || dropdownRef.current?.contains(target))
      ) {
        return;
      }
      close();
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [isOpen, close]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === KEY_ESCAPE) {
        close();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, close]);

  const dropdown =
    isOpen && dropdownPos
      ? ReactDOM.createPortal(
          <div
            ref={dropdownRef}
            role="menu"
            aria-label={ariaLabel}
            style={{
              position: 'fixed',
              top: `${dropdownPos.top}px`,
              right: `${dropdownPos.right}px`,
              zIndex: 10000,
              backgroundColor: theme.colors.background.paper,
              border: `1px solid ${theme.colors.border.light}`,
              borderRadius: theme.borderRadius.md,
              boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
              minWidth: '160px',
              overflow: 'hidden',
            }}
          >
            {items.map(item => (
              <button
                key={item.key}
                role="menuitem"
                type="button"
                onClick={() => {
                  item.onClick();
                  close();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: theme.spacing.sm,
                  width: '100%',
                  padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                  backgroundColor: COLOR_TRANSPARENT,
                  color: theme.colors.text.primary,
                  border: STRING_NONE,
                  cursor: 'pointer',
                  fontSize: theme.typography.fontSize.sm,
                  textAlign: 'left',
                }}
                onMouseEnter={event => {
                  (event.currentTarget as HTMLButtonElement).style.backgroundColor = theme.colors.background.default;
                }}
                onMouseLeave={event => {
                  (event.currentTarget as HTMLButtonElement).style.backgroundColor = COLOR_TRANSPARENT;
                }}
              >
                {item.icon && <span style={{ flexShrink: 0 }}>{item.icon}</span>}
                <span>{item.label}</span>
              </button>
            ))}
          </div>,
          document.body
        )
      : null;

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        ref={buttonRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => (isOpen ? close() : open())}
        style={{
          minWidth: `${TOUCH_TARGET_MIN_PX}px`,
          minHeight: `${TOUCH_TARGET_MIN_PX}px`,
          padding: `${theme.spacing.sm} ${theme.spacing.sm}`,
          backgroundColor: COLOR_TRANSPARENT,
          color: theme.colors.text.secondary,
          border: STRING_NONE,
          borderRadius: theme.borderRadius.md,
          cursor: 'pointer',
          fontSize: theme.typography.fontSize.xl,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          lineHeight: 1,
          fontWeight: theme.typography.fontWeight.bold,
          letterSpacing: '0.05em',
        }}
      >
        {OVERFLOW_MENU_ICON}
      </button>

      {dropdown}
    </div>
  );
};

export default OverflowMenu;
