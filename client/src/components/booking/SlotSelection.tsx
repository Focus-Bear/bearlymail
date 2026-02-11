import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { EMOJI_SELECTED } from 'constants/emojis';

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
}

export const SlotSelection: React.FC<SlotSelectionProps> = ({ slots, selectedSlot, onSelectSlot, timezone }) => {
  const { t } = useTranslation();
  
  return (
    <div style={{ flex: 1, minWidth: '300px' }}>
      <h2 style={{ 
        fontSize: theme.typography.fontSize.lg, 
        color: theme.colors.text.primary,
        marginBottom: theme.spacing.xs 
      }}>{t('booking.availableTimes')}</h2>
      {timezone && (
        <p style={{
          color: theme.colors.text.secondary,
          fontSize: theme.typography.fontSize.sm,
          marginTop: 0,
          marginBottom: theme.spacing.md,
        }}>{t('booking.timezoneNote', { timezone })}</p>
      )}
      
      {slots.length === 0 ? (
        <p style={{ color: theme.colors.text.secondary }}>{t('booking.noSlotsAvailable')}</p>
      ) : (
        <div style={{ display: 'grid', gap: theme.spacing.sm }}>
          {slots.map((slot) => {
            const start = new Date(slot.start);
            const isSelected = selectedSlot === slot;
            
            return (
              <button
                key={`${slot.start}-${slot.end}`}
                onClick={() => onSelectSlot(slot)}
                style={{
                  padding: theme.spacing.md,
                  border: `1px solid ${isSelected ? theme.colors.primary.main : theme.colors.border.medium}`,
                  backgroundColor: isSelected ? `${theme.colors.primary.main}10` : 'white',
                  borderRadius: theme.borderRadius.md,
                  cursor: 'pointer',
                  textAlign: 'left',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ fontWeight: theme.typography.fontWeight.medium, color: theme.colors.text.primary }}>
                    {start.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
                  </div>
                  <div style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.sm }}>
                    {start.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', timeZone: timezone || undefined })} ({t('booking.durationMinutes', { minutes: slot.duration })})
                  </div>
                </div>
                {isSelected && (
                  /* eslint-disable-next-line i18next/no-literal-string */
                  <span style={{ color: theme.colors.primary.main }}>{EMOJI_SELECTED}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};


