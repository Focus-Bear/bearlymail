import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { COLOR_NAMED_WHITE, COLOR_TRANSPARENT } from 'constants/colors';
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

interface TimeSlotButtonProps {
  slot: TimeSlot;
  isSelected: boolean;
  timezone: string;
  onSelect: (slot: TimeSlot) => void;
}

const TimeSlotButton: React.FC<TimeSlotButtonProps> = ({ slot, isSelected, timezone, onSelect }) => {
  const start = new Date(slot.start);

  return (
    <button
      key={`${slot.start}-${slot.end}`}
      onClick={() => onSelect(slot)}
      style={{
        padding: theme.spacing.md,
        border: `1px solid ${isSelected ? theme.colors.primary.main : theme.colors.border.medium}`,
        backgroundColor: isSelected ? `${theme.colors.primary.main}10` : 'white',
        borderRadius: theme.borderRadius.md,
        cursor: 'pointer',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: theme.spacing.xs,
        transition: 'all 0.2s',
      }}
      onMouseEnter={event => {
        if (!isSelected) {
          event.currentTarget.style.borderColor = theme.colors.primary.main;
          event.currentTarget.style.backgroundColor = `${theme.colors.primary.main}05`;
        }
      }}
      onMouseLeave={event => {
        if (!isSelected) {
          event.currentTarget.style.borderColor = theme.colors.border.medium;
          event.currentTarget.style.backgroundColor = COLOR_NAMED_WHITE;
        }
      }}
    >
      <div
        style={{
          fontWeight: theme.typography.fontWeight.medium,
          color: isSelected ? theme.colors.primary.main : theme.colors.text.primary,
          fontSize: theme.typography.fontSize.md,
        }}
      >
        {start.toLocaleTimeString(undefined, {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
          timeZone: timezone || undefined,
        })}
      </div>
      {isSelected && <span style={{ color: theme.colors.primary.main }}>{EMOJI_SELECTED}</span>}
    </button>
  );
};

interface DaySlotGroupProps {
  dayKey: string;
  daySlots: TimeSlot[];
  selectedSlot: TimeSlot | null;
  timezone: string;
  onSelectSlot: (slot: TimeSlot) => void;
}

const DaySlotGroup: React.FC<DaySlotGroupProps> = ({ dayKey, daySlots, selectedSlot, timezone, onSelectSlot }) => (
  <div>
    <h3
      style={{
        fontSize: theme.typography.fontSize.md,
        fontWeight: theme.typography.fontWeight.semibold,
        color: theme.colors.text.primary,
        marginBottom: theme.spacing.sm,
        marginTop: 0,
      }}
    >
      {dayKey}
    </h3>
    <div
      style={{
        display: 'grid',
        // Two columns keeps small day groups (e.g. 4 slots) in a balanced grid
        // instead of 3+1 orphans in a narrow booking column (~260–300px).
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        gap: theme.spacing.sm,
      }}
    >
      {daySlots.map(slot => (
        <TimeSlotButton
          key={`${slot.start}-${slot.end}`}
          slot={slot}
          isSelected={selectedSlot === slot}
          timezone={timezone}
          onSelect={onSelectSlot}
        />
      ))}
    </div>
  </div>
);

interface LoadMoreButtonProps {
  onLoadMore: () => void;
  loadingMore: boolean;
  t: (key: string) => string;
}

const LoadMoreButton: React.FC<LoadMoreButtonProps> = ({ onLoadMore, loadingMore, t }) => (
  <button
    type="button"
    onClick={onLoadMore}
    disabled={loadingMore}
    style={{
      padding: `${theme.spacing.sm} 0`,
      border: 'none',
      backgroundColor: COLOR_TRANSPARENT,
      borderRadius: theme.borderRadius.sm,
      cursor: loadingMore ? 'not-allowed' : 'pointer',
      color: theme.colors.secondary.main,
      fontWeight: theme.typography.fontWeight.medium,
      fontSize: theme.typography.fontSize.sm,
      marginTop: theme.spacing.md,
      marginBottom: theme.spacing.lg,
      opacity: loadingMore ? OPACITY_DISABLED : 1,
      textDecoration: 'underline',
      textUnderlineOffset: '3px',
      textAlign: 'left',
    }}
  >
    {loadingMore ? t('booking.loadingMore') : t('booking.loadMoreDates')}
  </button>
);

export const SlotSelection: React.FC<SlotSelectionProps> = ({
  slots,
  selectedSlot,
  onSelectSlot,
  timezone,
  onLoadMore,
  loadingMore = false,
  hasMore = true,
}) => {
  const { t } = useTranslation();

  const slotsByDay = useMemo(() => {
    const grouped = new Map<string, TimeSlot[]>();

    slots.forEach(slot => {
      const date = new Date(slot.start);
      const dayKey = date.toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });

      if (!grouped.has(dayKey)) {
        grouped.set(dayKey, []);
      }
      grouped.get(dayKey)!.push(slot);
    });

    return grouped;
  }, [slots]);

  return (
    <div style={{ flex: 1, minWidth: '300px', marginBottom: theme.spacing.xl }}>
      <h2
        style={{
          fontSize: theme.typography.fontSize.lg,
          color: theme.colors.text.primary,
          marginBottom: theme.spacing.xs,
        }}
      >
        {t('booking.availableTimes')}
      </h2>
      {timezone && (
        <p
          style={{
            color: theme.colors.text.secondary,
            fontSize: theme.typography.fontSize.sm,
            marginTop: 0,
            marginBottom: theme.spacing.md,
          }}
        >
          {t('booking.timezoneNote', { timezone })}
        </p>
      )}

      {slots.length === 0 ? (
        <div>
          <p style={{ color: theme.colors.text.secondary }}>{t('booking.noSlotsAvailable')}</p>
          {onLoadMore && hasMore && <LoadMoreButton onLoadMore={onLoadMore} loadingMore={loadingMore} t={t} />}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.lg }}>
          {Array.from(slotsByDay.entries()).map(([dayKey, daySlots]) => (
            <DaySlotGroup
              key={dayKey}
              dayKey={dayKey}
              daySlots={daySlots}
              selectedSlot={selectedSlot}
              timezone={timezone}
              onSelectSlot={onSelectSlot}
            />
          ))}

          {onLoadMore && hasMore && <LoadMoreButton onLoadMore={onLoadMore} loadingMore={loadingMore} t={t} />}
        </div>
      )}
    </div>
  );
};
