import React, { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { DUE_DATE_STATUS, type FocusBearDueDate } from 'utils/focusBearDueDate';
import { formatDate } from 'utils/parseDuration';
import { MAX_TASK_DURATION_MINUTES, splitIntoHoursAndMinutes } from 'utils/taskDuration';

export const DUE_DATE_MODE = {
  NEXT_FREE: 'nextFree',
  CUSTOM: 'custom',
} as const;

export type DueDateMode = (typeof DUE_DATE_MODE)[keyof typeof DUE_DATE_MODE];

/** A typed task length: `minutes` is null when it is blank or can't be read. */
export interface TaskDurationInput {
  minutes: number | null;
  isBlank: boolean;
}

const DAYS_TO_TOMORROW = 1;

export const fieldStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
  fontSize: theme.typography.fontSize.sm,
  border: `1px solid ${theme.colors.border.medium}`,
  borderRadius: theme.borderRadius.sm,
  backgroundColor: theme.colors.background.paper,
  color: theme.colors.text.primary,
};

const invalidFieldStyle: React.CSSProperties = { borderColor: theme.colors.error.main };

const fieldLabelStyle: React.CSSProperties = { fontSize: theme.typography.fontSize.xs };

const helperTextStyle: React.CSSProperties = {
  fontSize: theme.typography.fontSize.xs,
  color: theme.colors.text.secondary,
  minHeight: '1em',
};

const errorTextStyle: React.CSSProperties = { ...helperTextStyle, color: theme.colors.error.dark };

const fieldsetStyle: React.CSSProperties = {
  border: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: theme.spacing.xs,
};

const modeToggleStyle: React.CSSProperties = {
  display: 'flex',
  border: `1px solid ${theme.colors.border.medium}`,
  borderRadius: theme.borderRadius.sm,
  overflow: 'hidden',
};

// "Custom" takes only the room its word needs, so the longer option wraps between words rather than inside "to-do".
function modeOptionStyle(isSelected: boolean, isCompact: boolean): React.CSSProperties {
  return {
    flex: isCompact ? '0 0 auto' : 1,
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing.xs,
    padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
    fontSize: theme.typography.fontSize.xs,
    lineHeight: theme.typography.lineHeight.tight,
    cursor: 'pointer',
    backgroundColor: isSelected ? theme.colors.primary.subtle : theme.colors.background.paper,
    fontWeight: isSelected ? theme.typography.fontWeight.semibold : theme.typography.fontWeight.normal,
  };
}

const modeRadioStyle: React.CSSProperties = { margin: 0, accentColor: theme.colors.primary.main, flexShrink: 0 };

function isSameDay(left: Date, right: Date): boolean {
  return left.toDateString() === right.toDateString();
}

/** "Due today", "Due tomorrow" or "Due Fri 14th Nov", in the reader's language. */
function useDuePreview(date: Date): string {
  const { t, i18n } = useTranslation();
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + DAYS_TO_TOMORROW);
  if (isSameDay(date, now)) {
    return t('emailDetail.focusBearDuePreviewToday');
  }
  if (isSameDay(date, tomorrow)) {
    return t('emailDetail.focusBearDuePreviewTomorrow');
  }
  return t('emailDetail.focusBearDuePreviewDate', { date: formatDate(date, i18n.language, now) });
}

const DuePreview: React.FC<{ id: string; date: Date }> = ({ id, date }) => (
  <div id={id} aria-live="polite" style={helperTextStyle}>
    {useDuePreview(date)}
  </div>
);

/** What the line under the custom date says: the day it resolved to, or why it can't be used. */
const CustomDueStatus: React.FC<{ id: string; dueDate: FocusBearDueDate }> = ({ id, dueDate }) => {
  const { t } = useTranslation();
  switch (dueDate.status) {
    case DUE_DATE_STATUS.VALID:
      return <DuePreview id={id} date={dueDate.date} />;
    case DUE_DATE_STATUS.INVALID:
      return (
        <div id={id} role="alert" style={errorTextStyle}>
          {t('emailDetail.focusBearDueDateInvalid')}
        </div>
      );
    case DUE_DATE_STATUS.PAST:
      return (
        <div id={id} role="alert" style={errorTextStyle}>
          {t('emailDetail.focusBearDueDatePast')}
        </div>
      );
    default:
      return (
        <div id={id} style={helperTextStyle}>
          {t('emailDetail.focusBearDueDateEmpty')}
        </div>
      );
  }
};

/** The hint under "Next free spot": the day Focus Bear has free, once it has said. */
const NextFreeHint: React.FC<{ suggestedDay: string | null }> = ({ suggestedDay }) => {
  const { t, i18n } = useTranslation();
  if (!suggestedDay) {
    return <div style={helperTextStyle}>{t('emailDetail.focusBearNextFreeHint')}</div>;
  }
  const [year, month, day] = suggestedDay.split('-').map(Number);
  const date = formatDate(new Date(year, month - 1, day), i18n.language, new Date());
  return <div style={helperTextStyle}>{t('emailDetail.focusBearNextFreeHintWithDate', { date })}</div>;
};

interface DueDateFieldProps {
  mode: DueDateMode;
  onModeChange: (mode: DueDateMode) => void;
  customText: string;
  onCustomTextChange: (text: string) => void;
  customDueDate: FocusBearDueDate;
  /** The next free day Focus Bear suggested (`YYYY-MM-DD`), or null before it answers or without a connection. */
  suggestedDay: string | null;
  /** Ref to the selected mode's radio, for focusing it as the panel opens. */
  selectedModeRef: React.Ref<HTMLInputElement>;
}

/**
 * Due date: "Next free spot in my to-do list" (Focus Bear picks the day) or a custom day typed snooze-style.
 * Native radios, so arrow keys move between the two and screen readers announce a choice of two.
 */
export const DueDateField: React.FC<DueDateFieldProps> = ({
  mode,
  onModeChange,
  customText,
  onCustomTextChange,
  customDueDate,
  suggestedDay,
  selectedModeRef,
}) => {
  const { t } = useTranslation();
  const groupName = useId();
  const statusId = useId();
  const options = [
    { value: DUE_DATE_MODE.NEXT_FREE, label: t('emailDetail.focusBearDueDateNextFree') },
    { value: DUE_DATE_MODE.CUSTOM, label: t('emailDetail.focusBearDueDateCustom') },
  ];
  const isCustomInvalid =
    customDueDate.status === DUE_DATE_STATUS.INVALID || customDueDate.status === DUE_DATE_STATUS.PAST;

  return (
    <fieldset style={fieldsetStyle}>
      <legend style={{ ...fieldLabelStyle, padding: 0, marginBottom: theme.spacing.xs }}>
        {t('emailDetail.focusBearDueDate')}
      </legend>
      <div style={modeToggleStyle}>
        {options.map(option => (
          <label
            key={option.value}
            style={modeOptionStyle(mode === option.value, option.value === DUE_DATE_MODE.CUSTOM)}
          >
            <input
              ref={mode === option.value ? selectedModeRef : undefined}
              type="radio"
              name={groupName}
              value={option.value}
              checked={mode === option.value}
              onChange={() => onModeChange(option.value)}
              style={modeRadioStyle}
            />
            {option.label}
          </label>
        ))}
      </div>
      {mode === DUE_DATE_MODE.NEXT_FREE ? (
        <NextFreeHint suggestedDay={suggestedDay} />
      ) : (
        <>
          <input
            type="text"
            aria-label={t('emailDetail.focusBearCustomDueDate')}
            autoFocus
            autoComplete="off"
            value={customText}
            placeholder={t('emailDetail.focusBearCustomDueDatePlaceholder')}
            onChange={event => onCustomTextChange(event.target.value)}
            aria-invalid={isCustomInvalid}
            aria-describedby={statusId}
            style={{ ...fieldStyle, ...(isCustomInvalid ? invalidFieldStyle : {}) }}
          />
          <CustomDueStatus id={statusId} dueDate={customDueDate} />
        </>
      )}
    </fieldset>
  );
};

/** "45 min", "2 h" or "1 h 30 min". */
function useDurationLabel(totalMinutes: number): string {
  const { t } = useTranslation();
  const { hours, minutes } = splitIntoHoursAndMinutes(totalMinutes);
  if (hours === 0) {
    return t('emailDetail.focusBearDurationMinutes', { minutes });
  }
  if (minutes === 0) {
    return t('emailDetail.focusBearDurationHours', { hours });
  }
  return t('emailDetail.focusBearDurationHoursMinutes', { hours, minutes });
}

const DurationPreview: React.FC<{ id: string; minutes: number }> = ({ id, minutes }) => (
  <div id={id} aria-live="polite" style={helperTextStyle}>
    {useDurationLabel(minutes)}
  </div>
);

/** Whether a typed length can't be saved: unreadable, or longer than Focus Bear takes. */
export function isDurationInvalid(duration: TaskDurationInput): boolean {
  if (duration.isBlank) {
    return false;
  }
  return duration.minutes === null || duration.minutes > MAX_TASK_DURATION_MINUTES;
}

const DurationStatus: React.FC<{ id: string; duration: TaskDurationInput }> = ({ id, duration }) => {
  const { t } = useTranslation();
  if (duration.isBlank) {
    return (
      <div id={id} style={helperTextStyle}>
        {t('emailDetail.focusBearDurationBlank')}
      </div>
    );
  }
  if (duration.minutes === null) {
    return (
      <div id={id} role="alert" style={errorTextStyle}>
        {t('emailDetail.focusBearDurationInvalid')}
      </div>
    );
  }
  if (duration.minutes > MAX_TASK_DURATION_MINUTES) {
    return (
      <div id={id} role="alert" style={errorTextStyle}>
        {t('emailDetail.focusBearDurationTooLong')}
      </div>
    );
  }
  return <DurationPreview id={id} minutes={duration.minutes} />;
};

interface DurationFieldProps {
  text: string;
  onTextChange: (text: string) => void;
  duration: TaskDurationInput;
}

/** How long the task takes, typed snooze-style ("30m", "1h30"); blank leaves it to Focus Bear. */
export const DurationField: React.FC<DurationFieldProps> = ({ text, onTextChange, duration }) => {
  const { t } = useTranslation();
  const inputId = useId();
  const statusId = useId();
  const isInvalid = isDurationInvalid(duration);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.xs }}>
      <label htmlFor={inputId} style={fieldLabelStyle}>
        {t('emailDetail.focusBearDuration')}
      </label>
      <input
        id={inputId}
        type="text"
        autoComplete="off"
        value={text}
        placeholder={t('emailDetail.focusBearDurationPlaceholder')}
        onChange={event => onTextChange(event.target.value)}
        aria-invalid={isInvalid}
        aria-describedby={statusId}
        style={{ ...fieldStyle, ...(isInvalid ? invalidFieldStyle : {}) }}
      />
      <DurationStatus id={statusId} duration={duration} />
    </div>
  );
};
