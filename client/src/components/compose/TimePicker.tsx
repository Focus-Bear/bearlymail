import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { TimeSuggestion } from 'hooks/useScheduledEmails';

const OPACITY_DISABLED = 0.5;
const FONT_SIZE_SMALL = '14px';
const WARNING_ICON = '⚠️';

interface TimePickerProps {
  selectedTime: Date | null;
  suggestions: TimeSuggestion[];
  onTimeSelect: (time: Date) => void;
  onCancel: () => void;
  warning?: string;
  suggestedTime?: Date;
}

export const TimePicker: React.FC<TimePickerProps> = ({
  selectedTime,
  suggestions,
  onTimeSelect,
  onCancel,
  warning,
  suggestedTime,
}) => {
  const { t } = useTranslation();
  const [customDate, setCustomDate] = useState('');
  const [customTime, setCustomTime] = useState('');
  const [showCustom, setShowCustom] = useState(false);

  useEffect(() => {
    if (selectedTime) {
      const date = new Date(selectedTime);
      const dateStr = date.toISOString().split('T')[0];
      const timeStr = date.toTimeString().slice(0, 5);
      setCustomDate(dateStr);
      setCustomTime(timeStr);
    }
  }, [selectedTime]);

  const handleSuggestionClick = (suggestion: TimeSuggestion) => {
    onTimeSelect(new Date(suggestion.value));
  };

  const handleCustomTimeSubmit = () => {
    if (customDate && customTime) {
      const dateTime = new Date(`${customDate}T${customTime}`);
      onTimeSelect(dateTime);
    }
  };

  const handleUseSuggestion = () => {
    if (suggestedTime) {
      onTimeSelect(suggestedTime);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onCancel}
    >
      <div
        style={{
          backgroundColor: theme.colors.background,
          borderRadius: '8px',
          padding: '24px',
          maxWidth: '500px',
          width: '90%',
          maxHeight: '80vh',
          overflowY: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ marginTop: 0, color: theme.colors.text }}>
          {t('compose.scheduleEmail')}
        </h3>

        {warning && (
          <div
            style={{
              backgroundColor: theme.colors.warning + '20',
              border: `1px solid ${theme.colors.warning}`,
              borderRadius: '4px',
              padding: '12px',
              marginBottom: '16px',
            }}
          >
            <p style={{ margin: 0, color: theme.colors.text, fontSize: FONT_SIZE_SMALL }}>
              {WARNING_ICON} {warning}
            </p>
            {suggestedTime && (
              <button
                onClick={handleUseSuggestion}
                style={{
                  marginTop: '8px',
                  padding: '6px 12px',
                  backgroundColor: theme.colors.primary,
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                {t('compose.useSuggestion')} ({new Date(suggestedTime).toLocaleString()})
              </button>
            )}
          </div>
        )}

        <div style={{ marginBottom: '16px' }}>
          <h4 style={{ color: theme.colors.text, fontSize: '14px', marginBottom: '8px' }}>
            {t('compose.quickOptions')}
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {suggestions.map((suggestion, index) => (
              <button
                key={index}
                onClick={() => handleSuggestionClick(suggestion)}
                style={{
                  padding: '12px',
                  backgroundColor: theme.colors.surface,
                  border: `1px solid ${theme.colors.border}`,
                  borderRadius: '4px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background-color 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = theme.colors.hover;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = theme.colors.surface;
                }}
              >
                <div style={{ fontWeight: 'bold', color: theme.colors.text }}>
                  {suggestion.label}
                </div>
                <div style={{ fontSize: '12px', color: theme.colors.textSecondary }}>
                  {suggestion.description}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <button
            onClick={() => setShowCustom(!showCustom)}
            style={{
              padding: '8px 16px',
              backgroundColor: 'transparent',
              border: `1px solid ${theme.colors.border}`,
              borderRadius: '4px',
              cursor: 'pointer',
              color: theme.colors.text,
              width: '100%',
            }}
          >
            {showCustom ? t('compose.hideCustomTime') : t('compose.customTime')}
          </button>
        </div>

        {showCustom && (
          <div style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <input
                type="date"
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
                style={{
                  flex: 1,
                  padding: '8px',
                  border: `1px solid ${theme.colors.border}`,
                  borderRadius: '4px',
                  backgroundColor: theme.colors.surface,
                  color: theme.colors.text,
                }}
              />
              <input
                type="time"
                value={customTime}
                onChange={(e) => setCustomTime(e.target.value)}
                style={{
                  flex: 1,
                  padding: '8px',
                  border: `1px solid ${theme.colors.border}`,
                  borderRadius: '4px',
                  backgroundColor: theme.colors.surface,
                  color: theme.colors.text,
                }}
              />
            </div>
            <button
              onClick={handleCustomTimeSubmit}
              disabled={!customDate || !customTime}
              style={{
                padding: '8px 16px',
                backgroundColor: theme.colors.primary,
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: customDate && customTime ? 'pointer' : 'not-allowed',
                opacity: customDate && customTime ? 1 : OPACITY_DISABLED,
                width: '100%',
              }}
            >
              {t('compose.setCustomTime')}
            </button>
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1,
              padding: '10px',
              backgroundColor: theme.colors.surface,
              border: `1px solid ${theme.colors.border}`,
              borderRadius: '4px',
              cursor: 'pointer',
              color: theme.colors.text,
            }}
          >
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
};
