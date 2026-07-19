import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

interface CalendarInviteFormFieldsProps {
  guestEmail: string;
  guestName: string;
  title: string;
  description: string;
  startTime: string;
  durationMinutes: number;
  onGuestEmailChange: (value: string) => void;
  onGuestNameChange: (value: string) => void;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onStartTimeChange: (value: string) => void;
  onDurationChange: (value: number) => void;
}

const inputStyle = {
  width: '100%',
  padding: theme.spacing.sm,
  border: `1px solid ${theme.colors.border.medium}`,
  borderRadius: theme.borderRadius.md,
  fontSize: theme.typography.fontSize.base,
};

const labelStyle = {
  display: 'block',
  marginBottom: theme.spacing.xs,
  color: theme.colors.text.primary,
  fontWeight: theme.typography.fontWeight.medium,
};

export const CalendarInviteFormFields: React.FC<CalendarInviteFormFieldsProps> = ({
  guestEmail,
  guestName,
  title,
  description,
  startTime,
  durationMinutes,
  onGuestEmailChange,
  onGuestNameChange,
  onTitleChange,
  onDescriptionChange,
  onStartTimeChange,
  onDurationChange,
}) => {
  const { t } = useTranslation();

  return (
    <>
      <div style={{ marginBottom: theme.spacing.md }}>
        <label style={labelStyle}>{t('calendar.attendeeEmail')} *</label>
        <input
          type="email"
          value={guestEmail}
          onChange={event => onGuestEmailChange(event.target.value)}
          required
          style={inputStyle}
        />
      </div>
      <div style={{ marginBottom: theme.spacing.md }}>
        <label style={labelStyle}>{t('calendar.attendeeName')}</label>
        <input
          type="text"
          value={guestName}
          onChange={event => onGuestNameChange(event.target.value)}
          style={inputStyle}
        />
      </div>
      <div style={{ marginBottom: theme.spacing.md }}>
        <label style={labelStyle}>{t('calendar.eventTitle')} *</label>
        <input
          type="text"
          value={title}
          onChange={event => onTitleChange(event.target.value)}
          required
          style={inputStyle}
        />
      </div>
      <div style={{ marginBottom: theme.spacing.md }}>
        <label style={labelStyle}>{t('calendar.startTime')} *</label>
        <input
          type="datetime-local"
          value={startTime}
          onChange={event => onStartTimeChange(event.target.value)}
          required
          style={inputStyle}
        />
      </div>
      <div style={{ marginBottom: theme.spacing.md }}>
        <label style={labelStyle}>{t('calendar.duration')}</label>
        <select
          value={durationMinutes}
          onChange={event => onDurationChange(parseInt(event.target.value))}
          style={inputStyle}
        >
          <option value={15}>{t('calendar.duration15')}</option>
          <option value={30}>{t('calendar.duration30')}</option>
          <option value={45}>{t('calendar.duration45')}</option>
          <option value={60}>{t('calendar.duration60')}</option>
          <option value={90}>{t('calendar.duration90')}</option>
          <option value={120}>{t('calendar.duration120')}</option>
        </select>
      </div>
      <div style={{ marginBottom: theme.spacing.lg }}>
        <label style={labelStyle}>{t('calendar.description')}</label>
        <textarea
          value={description}
          onChange={event => onDescriptionChange(event.target.value)}
          rows={4}
          style={{
            ...inputStyle,
            fontFamily: theme.typography.fontFamily,
            resize: 'vertical',
          }}
        />
      </div>
    </>
  );
};
