import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { TFunction } from 'i18next';
import { theme } from 'theme/theme';

import { API_URL } from 'config/api';
import { COLOR_NAMED_WHITE } from 'constants/colors';
import { EMOJI_CALENDAR } from 'constants/emojis';
import {
  DAYS_IN_MONTH_30,
  MINUTES_PER_HOUR,
  SAVE_CONFIRMATION_DURATION_MS,
  SCHEDULING_GAP_15_MIN,
  SCHEDULING_GAP_45_MIN,
  SHORT_TIMEOUT_MS,
} from 'constants/numbers';
import { STRING_NONE, STRING_UTC } from 'constants/strings';
import { useAuth } from 'contexts/AuthContext';

import SchedulePreset from './SchedulePreset';
import { formatHour } from './SchedulingPreferencesHelpers';
import TimezoneSelect from './TimezoneSelect';

const DEBOUNCE_MS = 600;

interface SchedulingPreferences {
  availabilityStartHour: number;
  availabilityEndHour: number;
  availabilityDays: number[];
  meetingGapMinutes: number;
  deepWorkHoursPerDay: number;
  slotDurationMinutes: number;
  timezone: string;
}

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => i);

const GAP_OPTIONS = [0, SCHEDULING_GAP_15_MIN, DAYS_IN_MONTH_30, SCHEDULING_GAP_45_MIN, MINUTES_PER_HOUR];

const DEEP_WORK_OPTIONS = [0, 1, 2, 3, 4];

const SLOT_DURATION_OPTIONS = [SCHEDULING_GAP_15_MIN, DAYS_IN_MONTH_30, SCHEDULING_GAP_45_MIN, MINUTES_PER_HOUR];

interface SchedulingFormProps {
  prefs: SchedulingPreferences;
  savePrefs: (u: Partial<SchedulingPreferences>) => void;
  toggleDay: (day: number) => void;
  userId?: string;
  linkCopied: boolean;
  onCopyLink: () => void;
  labelStyle: React.CSSProperties;
  selectStyle: React.CSSProperties;
  t: TFunction;
}

const SchedulingForm: React.FC<SchedulingFormProps> = ({
  prefs,
  savePrefs,
  toggleDay,
  userId,
  linkCopied,
  onCopyLink,
  labelStyle,
  selectStyle,
  t,
}) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.lg }}>
    <div id="scheduling-availability">
      <div style={labelStyle}>{t('settings.schedulingPreferences.availabilityHours')}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm }}>
        <span style={{ fontSize: theme.typography.fontSize.lg, color: theme.colors.text.tertiary }}>
          {t('settings.schedulingPreferences.startHour')}
        </span>
        <select
          value={prefs.availabilityStartHour}
          onChange={event => savePrefs({ availabilityStartHour: Number(event.target.value) })}
          style={selectStyle}
        >
          {HOUR_OPTIONS.map(hour => (
            <option key={hour} value={hour}>
              {formatHour(hour)}
            </option>
          ))}
        </select>
        <span style={{ fontSize: theme.typography.fontSize.lg, color: theme.colors.text.tertiary }}>
          {t('settings.schedulingPreferences.endHour')}
        </span>
        <select
          value={prefs.availabilityEndHour}
          onChange={event => savePrefs({ availabilityEndHour: Number(event.target.value) })}
          style={selectStyle}
        >
          {HOUR_OPTIONS.map(hour => (
            <option key={hour} value={hour}>
              {formatHour(hour)}
            </option>
          ))}
        </select>
      </div>
    </div>
    <div>
      <div style={labelStyle}>{t('settings.schedulingPreferences.availabilityDays')}</div>
      <div style={{ display: 'flex', gap: theme.spacing.xs, flexWrap: 'wrap' }}>
        {DAY_KEYS.map((key, idx) => (
          <SchedulePreset
            key={key}
            label={t(`settings.schedulingPreferences.days.${key}`)}
            active={prefs.availabilityDays.includes(idx)}
            onClick={() => toggleDay(idx)}
          />
        ))}
      </div>
    </div>
    <div id="scheduling-meeting-gap">
      <div style={labelStyle}>{t('settings.schedulingPreferences.meetingGap')}</div>
      <select
        value={prefs.meetingGapMinutes}
        onChange={event => savePrefs({ meetingGapMinutes: Number(event.target.value) })}
        style={selectStyle}
      >
        {GAP_OPTIONS.map(minuteValue => (
          <option key={minuteValue} value={minuteValue}>
            {t('settings.schedulingPreferences.meetingGapMinutes', { count: minuteValue })}
          </option>
        ))}
      </select>
    </div>
    <div id="scheduling-deep-work">
      <div style={labelStyle}>{t('settings.schedulingPreferences.deepWork')}</div>
      <select
        value={prefs.deepWorkHoursPerDay}
        onChange={event => savePrefs({ deepWorkHoursPerDay: Number(event.target.value) })}
        style={selectStyle}
      >
        {DEEP_WORK_OPTIONS.map(hour => (
          <option key={hour} value={hour}>
            {t('settings.schedulingPreferences.deepWorkHours', { count: hour })}
          </option>
        ))}
      </select>
    </div>
    <div id="scheduling-slot-duration">
      <div style={labelStyle}>{t('settings.schedulingPreferences.slotDuration')}</div>
      <select
        value={prefs.slotDurationMinutes}
        onChange={event => savePrefs({ slotDurationMinutes: Number(event.target.value) })}
        style={selectStyle}
      >
        {SLOT_DURATION_OPTIONS.map(slotMinute => (
          <option key={slotMinute} value={slotMinute}>
            {t('settings.schedulingPreferences.slotDurationMinutes', { count: slotMinute })}
          </option>
        ))}
      </select>
    </div>
    <div id="scheduling-timezone">
      <div style={labelStyle}>{t('settings.schedulingPreferences.timezone')}</div>
      <TimezoneSelect value={prefs.timezone} onChange={timezone => savePrefs({ timezone })} />
    </div>
    {userId && (
      <div id="scheduling-booking-link">
        <div style={labelStyle}>{t('settings.schedulingPreferences.bookingLink')}</div>
        <p
          style={{
            fontSize: theme.typography.fontSize.lg,
            color: theme.colors.text.tertiary,
            marginBottom: theme.spacing.sm,
            marginTop: 0,
          }}
        >
          {t('settings.schedulingPreferences.bookingLinkDescription')}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm, flexWrap: 'wrap' }}>
          <div
            style={{
              flex: 1,
              minWidth: '200px',
              padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
              borderRadius: theme.borderRadius.sm,
              border: `1px solid ${theme.colors.border.medium}`,
              fontSize: theme.typography.fontSize.lg,
              backgroundColor: theme.colors.background.default,
              color: theme.colors.text.secondary,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >{`${window.location.origin}/book/${userId}`}</div>
          <button
            onClick={onCopyLink}
            style={{
              padding: `${theme.spacing.xs} ${theme.spacing.md}`,
              borderRadius: theme.borderRadius.sm,
              border: STRING_NONE,
              backgroundColor: linkCopied ? theme.colors.accent.success : theme.colors.primary.main,
              color: COLOR_NAMED_WHITE,
              fontSize: theme.typography.fontSize.lg,
              fontWeight: theme.typography.fontWeight.medium,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {linkCopied ? t('settings.schedulingPreferences.linkCopied') : t('settings.schedulingPreferences.copyLink')}
          </button>
        </div>
      </div>
    )}
  </div>
);

export const SchedulingPreferencesSection: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [linkCopied, setLinkCopied] = useState(false);
  const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [prefs, setPrefs] = useState<SchedulingPreferences>({
    availabilityStartHour: 9,
    availabilityEndHour: 17,
    availabilityDays: [1, 2, 3, 4, 5],
    meetingGapMinutes: 30,
    deepWorkHoursPerDay: 2,
    slotDurationMinutes: 30,
    timezone: browserTimezone,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestPrefs = useRef(prefs);

  useEffect(() => {
    axios
      .get(`${API_URL}/scheduling-preferences`)
      .then(res => {
        const responseData = res.data;
        if (responseData.timezone === STRING_UTC && browserTimezone !== STRING_UTC) {
          const updated = { ...responseData, timezone: browserTimezone };
          setPrefs(updated);
          latestPrefs.current = updated;
          axios
            .put(`${API_URL}/scheduling-preferences`, updated)
            .then(response => {
              setPrefs(response.data);
              latestPrefs.current = response.data;
            })
            .catch(() => {});
        } else {
          setPrefs(responseData);
          latestPrefs.current = responseData;
        }
      })
      .catch(() => {});
  }, [browserTimezone]);

  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, []);

  const savePrefs = useCallback((updates: Partial<SchedulingPreferences>) => {
    const newPrefs = { ...latestPrefs.current, ...updates };
    setPrefs(newPrefs);
    latestPrefs.current = newPrefs;
    setSaving(true);
    setSaved(false);

    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    debounceTimer.current = setTimeout(async () => {
      try {
        const res = await axios.put(`${API_URL}/scheduling-preferences`, newPrefs);
        setPrefs(res.data);
        latestPrefs.current = res.data;
        setSaved(true);
        setTimeout(() => setSaved(false), SAVE_CONFIRMATION_DURATION_MS);
      } catch {
        console.error('Failed to save scheduling preferences');
      } finally {
        setSaving(false);
      }
    }, DEBOUNCE_MS);
  }, []);

  const toggleDay = useCallback(
    (day: number) => {
      const days = prefs.availabilityDays.includes(day)
        ? prefs.availabilityDays.filter(dayItem => dayItem !== day)
        : [...prefs.availabilityDays, day].sort();
      savePrefs({ availabilityDays: days });
    },
    [prefs.availabilityDays, savePrefs]
  );

  const handleCopyBookingLink = useCallback(async () => {
    if (!user?.id) {
      return;
    }
    const bookingUrl = `${window.location.origin}/book/${user.id}`;
    try {
      await navigator.clipboard.writeText(bookingUrl);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), SHORT_TIMEOUT_MS);
    } catch (err) {
      console.error('Failed to copy booking link:', err);
    }
  }, [user?.id]);

  const labelStyle: React.CSSProperties = {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text.secondary,
    marginBottom: theme.spacing.xs,
  };
  const selectStyle: React.CSSProperties = {
    padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
    borderRadius: theme.borderRadius.sm,
    border: `1px solid ${theme.colors.border.medium}`,
    fontSize: theme.typography.fontSize.lg,
    backgroundColor: theme.colors.background.paper,
    color: theme.colors.text.primary,
  };

  return (
    <div
      id="scheduling-preferences"
      style={{
        backgroundColor: theme.colors.background.paper,
        borderRadius: theme.borderRadius.lg,
        border: `1px solid ${theme.colors.border.light}`,
        padding: theme.spacing.xl,
        marginBottom: theme.spacing.xl,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm, marginBottom: theme.spacing.md }}>
        <span style={{ fontSize: theme.typography.fontSize.xl }}>{EMOJI_CALENDAR}</span>
        <h2
          style={{
            fontSize: theme.typography.fontSize.lg,
            fontWeight: theme.typography.fontWeight.bold,
            color: theme.colors.text.primary,
            margin: 0,
          }}
        >
          {t('settings.schedulingPreferences.title')}
        </h2>
        {(saving || saved) && (
          <span
            style={{
              fontSize: theme.typography.fontSize.lg,
              color: saved ? theme.colors.accent.success : theme.colors.text.tertiary,
              marginLeft: 'auto',
            }}
          >
            {saved ? t('settings.schedulingPreferences.saved') : t('common.saving')}
          </span>
        )}
      </div>
      <p
        style={{
          fontSize: theme.typography.fontSize.lg,
          color: theme.colors.text.tertiary,
          marginBottom: theme.spacing.lg,
          lineHeight: theme.typography.lineHeight.normal,
        }}
      >
        {t('settings.schedulingPreferences.description')}
      </p>
      <SchedulingForm
        prefs={prefs}
        savePrefs={savePrefs}
        toggleDay={toggleDay}
        userId={user?.id}
        linkCopied={linkCopied}
        onCopyLink={handleCopyBookingLink}
        labelStyle={labelStyle}
        selectStyle={selectStyle}
        t={t}
      />
    </div>
  );
};
