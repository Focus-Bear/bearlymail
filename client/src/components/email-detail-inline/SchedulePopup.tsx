import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { COLOR_WHITE } from 'constants/colors';

import { getScheduleSuggestions } from './scheduleUtils';

const KEY_ESCAPE = 'Escape';
const COLOR_TRANSPARENT_BG = 'transparent';

interface SchedulePopupProps {
  onSelectSuggestion: (date: Date) => void;
  onPickCustom: () => void;
  onClose: () => void;
}

const itemStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  padding: '10px 16px',
  cursor: 'pointer',
  border: 'none',
  background: 'none',
  width: '100%',
  textAlign: 'left',
  borderBottom: `1px solid ${theme.colors.border.light}`,
  gap: '2px',
};

/**
 * Popup showing smart schedule suggestions (tomorrow morning, this afternoon, etc.)
 * and a "pick date & time" option. Closes on outside click or Escape.
 */
export const SchedulePopup: React.FC<SchedulePopupProps> = ({ onSelectSuggestion, onPickCustom, onClose }) => {
  const { t } = useTranslation();
  const popupRef = useRef<HTMLDivElement>(null);
  const suggestions = getScheduleSuggestions();

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === KEY_ESCAPE) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const setHoverBg = (evt: React.MouseEvent<HTMLButtonElement>, color: string) => {
    (evt.currentTarget as HTMLButtonElement).style.backgroundColor = color;
  };

  return (
    <div
      ref={popupRef}
      data-testid="schedule-popup"
      role="dialog"
      aria-label={t('emailDetail.schedulePopup.title')}
      style={{
        position: 'absolute',
        bottom: 'calc(100% + 8px)',
        right: 0,
        backgroundColor: COLOR_WHITE,
        border: `1px solid ${theme.colors.border.light}`,
        borderRadius: theme.borderRadius.md,
        boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
        minWidth: '240px',
        zIndex: 1000,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '10px 16px 8px',
          fontWeight: theme.typography.fontWeight.medium,
          fontSize: theme.typography.fontSize.sm,
          color: theme.colors.text.primary,
          borderBottom: `1px solid ${theme.colors.border.light}`,
        }}
      >
        {t('emailDetail.schedulePopup.title')}
      </div>

      {suggestions.map(suggestion => (
        <button
          key={suggestion.labelKey}
          style={itemStyle}
          onClick={() => onSelectSuggestion(suggestion.date)}
          onMouseEnter={evt => setHoverBg(evt, theme.colors.background.subtle)}
          onMouseLeave={evt => setHoverBg(evt, COLOR_TRANSPARENT_BG)}
        >
          <span style={{ fontSize: theme.typography.fontSize.sm, color: theme.colors.text.primary }}>
            {t(`emailDetail.schedulePopup.${suggestion.labelKey}`)}
          </span>
          <span style={{ fontSize: theme.typography.fontSize.xs, color: theme.colors.text.tertiary }}>
            {suggestion.sublabel}
          </span>
        </button>
      ))}

      <button
        style={{ ...itemStyle, borderBottom: 'none', color: theme.colors.primary.main }}
        onClick={onPickCustom}
        onMouseEnter={evt => setHoverBg(evt, theme.colors.background.subtle)}
        onMouseLeave={evt => setHoverBg(evt, COLOR_TRANSPARENT_BG)}
      >
        <span style={{ fontSize: theme.typography.fontSize.sm }}>{t('emailDetail.schedulePopup.pickDateTime')}</span>
      </button>
    </div>
  );
};
