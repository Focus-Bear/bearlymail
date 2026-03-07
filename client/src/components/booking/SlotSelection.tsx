import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { COLOR_NAMED_WHITE } from 'constants/colors';
import { EMOJI_SELECTED } from 'constants/emojis';
import { OPACITY_DISABLED } from 'constants/numbers';

interface TimeSlot {
  start: string;
  end: string;
  duration: number;
}

interface SlotSelectionProps {
  slots: TimeSlot[];
  selectedSlot: TimeSlot | null;
  onSelectSlot: (slot: TimeSlot) => void;
  timezone: string;
  onLoadMore?: () => void;
  loadingMore?: boolean;
  hasMore?: boolean;
}

export const SlotSelection: React.FC<SlotSelectionProps> = ({
  slots,
  selectedSlot,
  onSelectSlot,
  timezone,
  onLoadMore,
  loadingMore = false,
  hasMore = true
}) => {
  const { t } = useTranslation();

  // Group slots by day
  const slotsByDay = useMemo(() => {
    const grouped = new Map<string, TimeSlot[]>();

    slots.forEach(slot => {
      const date = new Date(slot.start);
      const dayKey = date.toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      });

      if (!grouped.has(dayKey)) {
        grouped.set(dayKey, []);
      }
      grouped.get(dayKey)!.push(slot);
    });

    return grouped;
  }, [slots]);

  return (
    <div style={{ flex: 1, minWidth: '300px' }}>
      <h2 style={{ fontSize: theme.typography.fontSize.lg, color: theme.colors.text.primary, marginBottom: theme.spacing.xs }}>{t('booking.availableTimes')}</h2>
      {timezone && (
        <p style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.sm, marginTop: 0, marginBottom: theme.spacing.md, }}>{t('booking.timezoneNote', { timezone })}</p>
      )}

      {slots.length === 0 ? (
        <p style={{ color: theme.colors.text.secondary }}>{t('booking.noSlotsAvailable')}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.lg }}>
          {Array.from(slotsByDay.entries()).map(([dayKey, daySlots]) => (
            <div key={dayKey}>
              <h3 style={{ fontSize: theme.typography.fontSize.md, fontWeight: theme.typography.fontWeight.semibold, color: theme.colors.text.primary, marginBottom: theme.spacing.sm, marginTop: 0, }}>
                {dayKey}
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: theme.spacing.sm }}>
                {daySlots.map((slot) => {
                  const start = new Date(slot.start);
                  const isSelected = selectedSlot === slot;

                  return (
                    <button
                      key={`${slot.start}-${slot.end}`}
                      onClick={() => onSelectSlot(slot)}
                      style={{ padding: theme.spacing.md, border: `1px solid ${isSelected ? theme.colors.primary.main : theme.colors.border.medium}`, backgroundColor: isSelected ? `${theme.colors.primary.main}10` : 'white', borderRadius: theme.borderRadius.md, cursor: 'pointer', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: theme.spacing.xs, transition: 'all 0.2s', }}
                      onMouseEnter={(event) => {
                        if (!isSelected) {
                          event.currentTarget.style.borderColor = theme.colors.primary.main;
                          event.currentTarget.style.backgroundColor = `${theme.colors.primary.main}05`;
                        }
                      }}
                      onMouseLeave={(event) => {
                        if (!isSelected) {
                          event.currentTarget.style.borderColor = theme.colors.border.medium;
                          event.currentTarget.style.backgroundColor = COLOR_NAMED_WHITE;
                        }
                      }}
                    >
                      <div style={{ fontWeight: theme.typography.fontWeight.medium, color: isSelected ? theme.colors.primary.main : theme.colors.text.primary, fontSize: theme.typography.fontSize.md, }}>
                        {start.toLocaleTimeString(undefined, {
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: true,
                          timeZone: timezone || undefined
                        })}
                      </div>
                      {isSelected && (
                        <span style={{ color: theme.colors.primary.main }}>{EMOJI_SELECTED}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {onLoadMore && hasMore && (
            <button
              onClick={onLoadMore}
              disabled={loadingMore}
              style={{ padding: theme.spacing.md, border: `1px solid ${theme.colors.border.medium}`, backgroundColor: COLOR_NAMED_WHITE, borderRadius: theme.borderRadius.md, cursor: loadingMore ? 'not-allowed' : 'pointer', color: theme.colors.primary.main, fontWeight: theme.typography.fontWeight.medium, marginTop: theme.spacing.md, opacity: loadingMore ? OPACITY_DISABLED : 1, }}
            >
              {loadingMore ? t('booking.loadingMore') : t('booking.loadMoreDates')}
            </button>
          )}
        </div>
      )}
    </div>
  );
};


