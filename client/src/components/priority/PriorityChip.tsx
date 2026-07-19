import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { PRIORITY_LEVELS, PriorityLevelDef, selectedPriorityLevel } from 'components/priority/priorityLevels';
import { KEY_ESCAPE, LETTER_SPACING_WIDER } from 'constants/strings';

const CARET_DOWN = '▾';
const CHECK_MARK = '✓';
const SPARKLE = '✨';
const PRIORITY_PLACEHOLDER_EMOJI = '🎚️';

const MENU_ALIGN_LEFT = 'left';
const MENU_ALIGN_RIGHT = 'right';
type MenuAlign = typeof MENU_ALIGN_LEFT | typeof MENU_ALIGN_RIGHT;

interface PriorityMenuItemProps {
  level: PriorityLevelDef;
  on: boolean;
  label: string;
  hint: string;
  onSelect: (e: React.MouseEvent) => void;
}

/** One level row inside the priority dropdown — emoji, label, effect hint and a check when active. */
const PriorityMenuItem: React.FC<PriorityMenuItemProps> = ({ level, on, label, hint, onSelect }) => (
  <button
    type="button"
    role="menuitemradio"
    aria-checked={on}
    onClick={onSelect}
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      width: '100%',
      padding: '8px 10px',
      borderRadius: theme.borderRadius.md,
      border: 'none',
      cursor: 'pointer',
      textAlign: 'left',
      background: on ? theme.colors.background.subtle : 'transparent',
      transition: 'background 0.12s ease',
    }}
    onMouseEnter={event => {
      if (!on) {
        event.currentTarget.style.background = theme.colors.background.subtle;
      }
    }}
    onMouseLeave={event => {
      if (!on) {
        event.currentTarget.style.background = 'transparent';
      }
    }}
  >
    <span aria-hidden style={{ fontSize: '18px', flexShrink: 0 }}>
      {level.emoji}
    </span>
    <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
      <span
        style={{
          fontSize: theme.typography.fontSize.sm,
          fontWeight: theme.typography.fontWeight.semibold,
          color: on ? level.color : theme.colors.text.primary,
        }}
      >
        {label}
      </span>
      <span style={{ fontSize: '11.5px', color: theme.colors.text.tertiary }}>{hint}</span>
    </span>
    {on && <span style={{ color: level.color, fontWeight: theme.typography.fontWeight.bold }}>{CHECK_MARK}</span>}
  </button>
);

interface PriorityMenuProps {
  selected: PriorityLevelDef | null;
  onPick: (newStarCount: number, e: React.MouseEvent) => void;
  /** Which edge the menu is anchored to — `right` keeps it on-screen when the chip is right-aligned. */
  align: MenuAlign;
}

/** The dropdown panel — header ("Set priority · trains AI") plus a row per level. */
const PriorityMenu: React.FC<PriorityMenuProps> = ({ selected, onPick, align }) => {
  const { t } = useTranslation();
  return (
    <div
      role="menu"
      style={{
        position: 'absolute',
        top: 'calc(100% + 6px)',
        ...(align === MENU_ALIGN_RIGHT ? { right: 0 } : { left: 0 }),
        zIndex: 20,
        minWidth: '220px',
        background: theme.colors.common.white,
        border: `1px solid ${theme.colors.border.light}`,
        borderRadius: theme.borderRadius.lg,
        boxShadow: '0 10px 28px -8px rgba(0,0,0,0.25)',
        padding: '6px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px 8px' }}>
        <span
          style={{
            fontSize: '10.5px',
            fontWeight: theme.typography.fontWeight.bold,
            letterSpacing: LETTER_SPACING_WIDER,
            textTransform: 'uppercase',
            color: theme.colors.text.tertiary,
          }}
        >
          {t('inbox.setPriority')}
        </span>
        <span style={{ fontSize: '11px', color: theme.colors.text.tertiary }}>
          {t('inbox.priorityTrainsAi')} <span style={{ color: theme.colors.primary.main }}>{SPARKLE}</span>
        </span>
      </div>

      {PRIORITY_LEVELS.map(level => {
        const on = selected?.value === level.value;
        const newCount = on ? 0 : level.value;
        return (
          <PriorityMenuItem
            key={level.value}
            level={level}
            on={on}
            label={t(level.labelKey)}
            hint={t(level.hintKey)}
            onSelect={event => {
              event.stopPropagation();
              onPick(newCount, event);
            }}
          />
        );
      })}
    </div>
  );
};

interface PriorityChipProps {
  starCount: number;
  onSelect: (newStarCount: number, e: React.MouseEvent) => void;
  /**
   * Lay the "PRIORITY" label out beside the chip (one row) rather than stacked above it.
   * Used when the chip sits inline in the email-detail action toolbar; the split view keeps
   * the default stacked layout.
   */
  inlineLabel?: boolean;
  /**
   * Edge the dropdown menu anchors to. Defaults to `left`; pass `right` when the chip is
   * right-aligned (e.g. far right of the toolbar) so the menu doesn't overflow the viewport.
   */
  menuAlign?: MenuAlign;
}

/**
 * Open-email priority control — a compact chip in the action toolbar that opens a menu
 * of the three levels (each with a one-line effect description). Keeping priority as a
 * single chip rather than three inline buttons stops it reading like another action and
 * keeps the toolbar tidy. Selecting the active level again clears it back to 0.
 */
export const PriorityChip: React.FC<PriorityChipProps> = ({
  starCount,
  onSelect,
  inlineLabel = false,
  menuAlign = MENU_ALIGN_LEFT,
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selected = selectedPriorityLevel(starCount);

  // Close the menu on outside click or Escape.
  useEffect(() => {
    if (!open) {
      return;
    }
    const onDocClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === KEY_ESCAPE) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        flexDirection: inlineLabel ? 'row' : 'column',
        alignItems: inlineLabel ? 'center' : 'stretch',
        gap: inlineLabel ? '8px' : '4px',
      }}
    >
      <span
        style={{
          fontSize: '11px',
          fontWeight: theme.typography.fontWeight.bold,
          letterSpacing: LETTER_SPACING_WIDER,
          textTransform: 'uppercase',
          color: theme.colors.text.tertiary,
          whiteSpace: 'nowrap',
        }}
      >
        {t('inbox.priorityHeading')}
      </span>

      <div style={{ position: 'relative' }}>
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={t('inbox.setPriority')}
          onClick={event => {
            event.stopPropagation();
            setOpen(prev => !prev);
          }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '5px 10px',
            borderRadius: theme.borderRadius.md,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            fontSize: theme.typography.fontSize.sm,
            fontWeight: theme.typography.fontWeight.semibold,
            background: selected ? theme.colors.background.subtle : theme.colors.common.white,
            color: selected ? selected.color : theme.colors.text.secondary,
            border: `1px solid ${selected ? selected.color : theme.colors.border.medium}`,
            transition: 'all 0.15s ease',
          }}
        >
          <span aria-hidden>{selected ? selected.emoji : PRIORITY_PLACEHOLDER_EMOJI}</span>
          <span>{selected ? t(selected.labelKey) : t('inbox.setPriority')}</span>
          <span aria-hidden style={{ fontSize: '9px', opacity: 0.7 }}>
            {CARET_DOWN}
          </span>
        </button>

        {open && (
          <PriorityMenu
            selected={selected}
            align={menuAlign}
            onPick={(newCount, event) => {
              onSelect(newCount, event);
              setOpen(false);
            }}
          />
        )}
      </div>
    </div>
  );
};
