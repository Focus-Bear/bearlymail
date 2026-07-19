import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { PRIORITY_LEVELS, selectedPriorityLevel } from 'components/priority/priorityLevels';
import { LETTER_SPACING_WIDER } from 'constants/strings';

interface PriorityPillProps {
  emoji: string;
  label: string;
  /** Filled (selected) styling in `color` when true; otherwise the neutral outline pill. */
  active?: boolean;
  color?: string;
  /** Adds the triage `.animate-recommended-pulse` class (see App.css). */
  pulse?: boolean;
  /** Toggle controls set this; action pills (e.g. Archive) leave it undefined. */
  ariaPressed?: boolean;
  onClick: (e: React.MouseEvent) => void;
}

/** A single slim pill — shared by the priority levels and the leading Archive action. */
export const PriorityPill: React.FC<PriorityPillProps> = ({
  emoji,
  label,
  active = false,
  color,
  pulse = false,
  ariaPressed,
  onClick,
}) => (
  <button
    type="button"
    aria-pressed={ariaPressed}
    aria-label={label}
    className={pulse ? 'animate-recommended-pulse' : undefined}
    onClick={onClick}
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '5px',
      padding: '4px 11px',
      borderRadius: theme.borderRadius.full || '999px',
      cursor: 'pointer',
      whiteSpace: 'nowrap',
      fontSize: theme.typography.fontSize.sm,
      fontWeight: active ? theme.typography.fontWeight.semibold : theme.typography.fontWeight.medium,
      transition: 'all 0.15s ease',
      ...(active && color
        ? {
            background: color,
            color: theme.colors.common.white,
            border: `1px solid ${color}`,
            boxShadow: `0 1px 6px -2px ${color}`,
          }
        : {
            background: theme.colors.common.white,
            color: theme.colors.text.secondary,
            border: `1px solid ${theme.colors.border.medium}`,
          }),
    }}
  >
    <span aria-hidden>{emoji}</span>
    <span>{label}</span>
  </button>
);

interface PriorityInlineSelectorProps {
  starCount: number;
  onSelect: (newStarCount: number, e: React.MouseEvent) => void;
  /**
   * Star level the triage AI recommends. The matching pill gets the
   * `.animate-recommended-pulse` class so CSS in App.css can pulse it.
   */
  recommendedStarCount?: number | null;
  /** Optional pill rendered before the level pills — used for the Archive action in the inbox row. */
  leadingPill?: React.ReactNode;
  /** Lay the "PRIORITY" label inline (left, with a divider) beside the pills instead of stacked above. */
  inlineLabel?: boolean;
}

/**
 * Slim, one-tap priority control for the inbox list. All three levels stay visible as
 * inline pills — no menu — so picking a priority is a single click and the row stays
 * compact (unlike the tall slider meter). Selecting the active pill toggles back to 0.
 * An optional `leadingPill` (the Archive action) sits first, per the inbox-list design.
 */
export const PriorityInlineSelector: React.FC<PriorityInlineSelectorProps> = ({
  starCount,
  onSelect,
  recommendedStarCount = null,
  leadingPill,
  inlineLabel = false,
}) => {
  const { t } = useTranslation();
  const selected = selectedPriorityLevel(starCount);
  const caption = selected ? t(selected.hintKey) : t('inbox.priorityCaptionNone');

  const heading = (
    // The class lets the inbox card's `email-actions` container query (App.css) hide the
    // heading on very narrow cards so the pills and actions still share one row.
    <span
      className="email-priority-heading"
      style={{
        fontSize: '11px',
        fontWeight: theme.typography.fontWeight.bold,
        letterSpacing: LETTER_SPACING_WIDER,
        textTransform: 'uppercase',
        color: theme.colors.primary.dark,
        whiteSpace: 'nowrap',
      }}
    >
      {t('inbox.priorityHeading')}
    </span>
  );

  const pills = (
    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
      {leadingPill}
      {PRIORITY_LEVELS.map(level => {
        const on = selected?.value === level.value;
        const newCount = on ? 0 : level.value;
        return (
          <PriorityPill
            key={level.value}
            emoji={level.emoji}
            label={t(level.labelKey)}
            active={on}
            color={level.color}
            ariaPressed={on}
            pulse={recommendedStarCount === level.value}
            onClick={event => {
              event.stopPropagation();
              onSelect(newCount, event);
            }}
          />
        );
      })}
    </div>
  );

  const captionEl = (
    <span style={{ fontSize: '11.5px', color: theme.colors.text.tertiary, lineHeight: 1.4 }}>{caption}</span>
  );

  if (inlineLabel) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          {heading}
          {pills}
        </div>
        {captionEl}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {heading}
      {pills}
      {captionEl}
    </div>
  );
};
