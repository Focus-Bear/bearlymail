import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { theme } from 'theme/theme';
import { SCHEDULING_GAP_15_MIN, SCHEDULING_GAP_45_MIN, SAVE_CONFIRMATION_DURATION_MS, HOURS_12_HOUR_FORMAT, DAYS_IN_MONTH_30, SHORT_TIMEOUT_MS } from 'constants/numbers';
import { API_URL } from 'config/api';
import { EMOJI_CALENDAR } from 'constants/emojis';
import { TimezoneAutocomplete } from 'components/common/TimezoneAutocomplete';
import { useAuth } from 'contexts/AuthContext';

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

const GAP_OPTIONS = [0, SCHEDULING_GAP_15_MIN, DAYS_IN_MONTH_30, SCHEDULING_GAP_45_MIN, 60];

const DEEP_WORK_OPTIONS = [0, 1, 2, 3, 4];

const SLOT_DURATION_OPTIONS = [SCHEDULING_GAP_15_MIN, DAYS_IN_MONTH_30, SCHEDULING_GAP_45_MIN, 60];

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
    axios.get(`${API_URL}/scheduling-preferences`)
      .then((res) => {
        const data = res.data;
        if (data.timezone === 'UTC' && browserTimezone !== 'UTC') {
          const updated = { ...data, timezone: browserTimezone };
          setPrefs(updated);
          latestPrefs.current = updated;
          axios.put(`${API_URL}/scheduling-preferences`, updated)
            .then((r) => {
              setPrefs(r.data);
              latestPrefs.current = r.data;
            })
            .catch(() => {});
        } else {
          setPrefs(data);
          latestPrefs.current = data;
        }
      })
      .catch(() => {});
  }, [browserTimezone]);

  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  const savePrefs = useCallback((updates: Partial<SchedulingPreferences>) => {
    const newPrefs = { ...latestPrefs.current, ...updates };
    setPrefs(newPrefs);
    latestPrefs.current = newPrefs;
    setSaving(true);
    setSaved(false);

    if (debounceTimer.current) clearTimeout(debounceTimer.current);
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

  const toggleDay = useCallback((day: number) => {
    const days = prefs.availabilityDays.includes(day)
      ? prefs.availabilityDays.filter((d) => d !== day)
      : [...prefs.availabilityDays, day].sort();
    savePrefs({ availabilityDays: days });
  }, [prefs.availabilityDays, savePrefs]);

  const handleCopyBookingLink = useCallback(async () => {
    if (!user?.id) return;
    const bookingUrl = `${window.location.origin}/book/${user.id}`;
    try {
      await navigator.clipboard.writeText(bookingUrl);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), SHORT_TIMEOUT_MS);
    } catch (err) {
      console.error('Failed to copy booking link:', err);
    }
  }, [user?.id]);

  const formatHour = (hour: number): string => {
    if (hour === 0) return '12 AM';
    if (hour < HOURS_12_HOUR_FORMAT) return `${hour} AM`;
    if (hour === HOURS_12_HOUR_FORMAT) return '12 PM';
    return `${hour - HOURS_12_HOUR_FORMAT} PM`;
  };

  const labelStyle: React.CSSProperties = {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.text.secondary,
    marginBottom: theme.spacing.xs,
  };

  const selectStyle: React.CSSProperties = {
    padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
    borderRadius: theme.borderRadius.sm,
    border: `1px solid ${theme.colors.border.medium}`,
    fontSize: theme.typography.fontSize.sm,
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
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: theme.spacing.sm,
        marginBottom: theme.spacing.md,
      }}>
        {/* eslint-disable-next-line i18next/no-literal-string */}
        <span style={{ fontSize: theme.typography.fontSize.xl }}>{EMOJI_CALENDAR}</span>
        <h2 style={{
          fontSize: theme.typography.fontSize.lg,
          fontWeight: theme.typography.fontWeight.bold,
          color: theme.colors.text.primary,
          margin: 0,
        }}>
          {t('settings.schedulingPreferences.title')}
        </h2>
        {(saving || saved) && (
          <span style={{
            fontSize: theme.typography.fontSize.sm,
            color: saved ? theme.colors.accent.success : theme.colors.text.tertiary,
            marginLeft: 'auto',
          }}>
            {saved ? t('settings.schedulingPreferences.saved') : t('common.saving')}
          </span>
        )}
      </div>

      <p style={{
        fontSize: theme.typography.fontSize.sm,
        color: theme.colors.text.tertiary,
        marginBottom: theme.spacing.lg,
        lineHeight: theme.typography.lineHeight.normal,
      }}>
        {t('settings.schedulingPreferences.description')}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.lg }}>
        <div id="scheduling-availability">
          <div style={labelStyle}>{t('settings.schedulingPreferences.availabilityHours')}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm }}>
            <span style={{ fontSize: theme.typography.fontSize.sm, color: theme.colors.text.tertiary }}>
              {t('settings.schedulingPreferences.startHour')}
            </span>
            <select
              value={prefs.availabilityStartHour}
              onChange={(e) => savePrefs({ availabilityStartHour: Number(e.target.value) })}
              style={selectStyle}
            >
              {HOUR_OPTIONS.map((h) => (
                <option key={h} value={h}>{formatHour(h)}</option>
              ))}
            </select>
            <span style={{ fontSize: theme.typography.fontSize.sm, color: theme.colors.text.tertiary }}>
              {t('settings.schedulingPreferences.endHour')}
            </span>
            <select
              value={prefs.availabilityEndHour}
              onChange={(e) => savePrefs({ availabilityEndHour: Number(e.target.value) })}
              style={selectStyle}
            >
              {HOUR_OPTIONS.map((h) => (
                <option key={h} value={h}>{formatHour(h)}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <div style={labelStyle}>{t('settings.schedulingPreferences.availabilityDays')}</div>
          <div style={{ display: 'flex', gap: theme.spacing.xs, flexWrap: 'wrap' }}>
            {DAY_KEYS.map((key, idx) => (
              <button
                key={key}
                onClick={() => toggleDay(idx)}
                style={{
                  padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                  borderRadius: theme.borderRadius.sm,
                  border: `1px solid ${prefs.availabilityDays.includes(idx) ? theme.colors.primary.main : theme.colors.border.medium}`,
                  backgroundColor: prefs.availabilityDays.includes(idx) ? theme.colors.primary.main : 'transparent',
                  color: prefs.availabilityDays.includes(idx) ? 'white' : theme.colors.text.secondary,
                  fontSize: theme.typography.fontSize.sm,
                  fontWeight: theme.typography.fontWeight.medium,
                  cursor: 'pointer',
                  minWidth: '44px',
                }}
              >
                {t(`settings.schedulingPreferences.days.${key}`)}
              </button>
            ))}
          </div>
        </div>

        <div id="scheduling-meeting-gap">
          <div style={labelStyle}>{t('settings.schedulingPreferences.meetingGap')}</div>
          <select
            value={prefs.meetingGapMinutes}
            onChange={(e) => savePrefs({ meetingGapMinutes: Number(e.target.value) })}
            style={selectStyle}
          >
            {GAP_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {t('settings.schedulingPreferences.meetingGapMinutes', { count: m })}
              </option>
            ))}
          </select>
        </div>

        <div id="scheduling-deep-work">
          <div style={labelStyle}>{t('settings.schedulingPreferences.deepWork')}</div>
          <select
            value={prefs.deepWorkHoursPerDay}
            onChange={(e) => savePrefs({ deepWorkHoursPerDay: Number(e.target.value) })}
            style={selectStyle}
          >
            {DEEP_WORK_OPTIONS.map((h) => (
              <option key={h} value={h}>
                {t('settings.schedulingPreferences.deepWorkHours', { count: h })}
              </option>
            ))}
          </select>
        </div>

        <div id="scheduling-slot-duration">
          <div style={labelStyle}>{t('settings.schedulingPreferences.slotDuration')}</div>
          <select
            value={prefs.slotDurationMinutes}
            onChange={(e) => savePrefs({ slotDurationMinutes: Number(e.target.value) })}
            style={selectStyle}
          >
            {SLOT_DURATION_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {t('settings.schedulingPreferences.slotDurationMinutes', { count: m })}
              </option>
            ))}
          </select>
        </div>

        <div id="scheduling-timezone">
          <div style={labelStyle}>{t('settings.schedulingPreferences.timezone')}</div>
          <TimezoneAutocomplete
            value={prefs.timezone}
            onChange={(timezone) => savePrefs({ timezone })}
          />
        </div>

        {user?.id && (
          <div id="scheduling-booking-link">
            <div style={labelStyle}>{t('settings.schedulingPreferences.bookingLink')}</div>
            <p style={{
              fontSize: theme.typography.fontSize.sm,
              color: theme.colors.text.tertiary,
              marginBottom: theme.spacing.sm,
              marginTop: 0,
            }}>
              {t('settings.schedulingPreferences.bookingLinkDescription')}
            </p>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: theme.spacing.sm,
              flexWrap: 'wrap',
            }}>
              <div style={{
                flex: 1,
                minWidth: '200px',
                padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                borderRadius: theme.borderRadius.sm,
                border: `1px solid ${theme.colors.border.medium}`,
                fontSize: theme.typography.fontSize.sm,
                backgroundColor: theme.colors.background.default,
                color: theme.colors.text.secondary,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {`${window.location.origin}/book/${user.id}`}
              </div>
              <button
                onClick={handleCopyBookingLink}
                style={{
                  padding: `${theme.spacing.xs} ${theme.spacing.md}`,
                  borderRadius: theme.borderRadius.sm,
                  border: 'none',
                  backgroundColor: linkCopied
                    ? theme.colors.accent.success
                    : theme.colors.primary.main,
                  color: 'white',
                  fontSize: theme.typography.fontSize.sm,
                  fontWeight: theme.typography.fontWeight.medium,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {linkCopied
                  ? t('settings.schedulingPreferences.linkCopied')
                  : t('settings.schedulingPreferences.copyLink')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
