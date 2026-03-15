import React, { useCallback, useEffect, useRef, useState } from 'react';
import { theme } from 'theme/theme';

import { STRING_NONE } from 'constants/strings';

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
export const OverflowMenu: React.FC<OverflowMenuProps> = ({ items, 'aria-label': ariaLabel = 'More options' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setIsOpen(false), []);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const handleMouseDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        close();
      }
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
      if (event.key === 'Escape') {
        close();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, close]);

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(prev => !prev)}
        style={{
          padding: `${theme.spacing.sm} ${theme.spacing.sm}`,
          backgroundColor: 'transparent',
          color: theme.colors.text.secondary,
          border: STRING_NONE,
          borderRadius: theme.borderRadius.md,
          cursor: 'pointer',
          fontSize: theme.typography.fontSize.sm,
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

      {isOpen && (
        <div
          role="menu"
          aria-label={ariaLabel}
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            zIndex: 1000,
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
                backgroundColor: 'transparent',
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
                (event.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
              }}
            >
              {item.icon && <span style={{ flexShrink: 0 }}>{item.icon}</span>}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default OverflowMenu;
