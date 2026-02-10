import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { theme } from 'theme/theme';
import { API_URL } from 'config/api';
import { EMOJI_CALENDAR } from 'constants/emojis';

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

const GAP_OPTIONS = [0, 15, 30, 45, 60];

const DEEP_WORK_OPTIONS = [0, 1, 2, 3, 4];

const SLOT_DURATION_OPTIONS = [15, 30, 45, 60];

export const SchedulingPreferencesSection: React.FC = () => {
  const { t } = useTranslation();
  const [prefs, setPrefs] = useState<SchedulingPreferences>({
    availabilityStartHour: 9,
    availabilityEndHour: 17,
    availabilityDays: [1, 2, 3, 4, 5],
    meetingGapMinutes: 30,
    deepWorkHoursPerDay: 2,
    slotDurationMinutes: 30,
    timezone: 'UTC',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestPrefs = useRef(prefs);

  useEffect(() => {
    axios.get(`${API_URL}/scheduling-preferences`)
      .then((res) => {
        setPrefs(res.data);
        latestPrefs.current = res.data;
      })
      .catch(() => {});
  }, []);

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
        setTimeout(() => setSaved(false), 2000);
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

  const formatHour = (hour: number): string => {
    if (hour === 0) return '12 AM';
    if (hour < 12) return `${hour} AM`;
    if (hour === 12) return '12 PM';
    return `${hour - 12} PM`;
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
        <div>
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

        <div>
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

        <div>
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

        <div>
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
      </div>
    </div>
  );
};
